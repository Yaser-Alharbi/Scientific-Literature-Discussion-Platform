# # backend/livestream/views.py

import logging
import uuid
import json
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from livekit.api import AccessToken, VideoGrants
# Import the correct proto modules
from livekit.api.room_service import CreateRoomRequest, DeleteRoomRequest
from .models import Room, Participant, SharedExtract
from django.utils import timezone
from django.db.models import Q
from papers.models import PaperExtract

logger = logging.getLogger(__name__)

from .webhook_events import handle_room_finished, handle_participant_joined, handle_participant_left
from .services import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, sync_livekit, get_livekit_client

@api_view(['GET'])
@permission_classes([AllowAny])  # Temporarily allow any user for testing
def room_list(request):
    """List all active rooms"""
    rooms = Room.objects.filter(is_active=True).order_by('-created_at')
    
    room_data = []
    for room in rooms:
        # Count participants
        participant_count = Participant.objects.filter(room=room).count()
        
        # Get host details - use full name if available
        host_name = "Unknown"
        if room.host:
            if room.host.first_name or room.host.last_name:
                host_name = f"{room.host.first_name} {room.host.last_name}".strip()
            else:
                host_name = room.host.username
        
        # Get research interests
        research_interests = [interest.name for interest in room.research_interests.all()]
        
        room_info = {
            'id': room.id,
            'room_id': room.room_id,
            'title': room.name,
            'numParticipants': participant_count,
            'hostId': str(room.host.id) if room.host else None,
            'hostName': host_name,
            'createdAt': room.created_at.isoformat(),
            'isActive': room.is_active,
            'research_interests': research_interests
        }
        room_data.append(room_info)
    
    return Response(room_data)

@api_view(['GET'])
@permission_classes([AllowAny])  # Temporarily allow any user for testing
def room_detail(request, room_id):
    """Get details of a specific room"""
    try:
        room = Room.objects.get(room_id=room_id)
        return Response({
            'id': room.id,
            'name': room.name,
            'roomId': room.room_id,
            'createdAt': room.created_at,
            'isActive': room.is_active
        })
    except Room.DoesNotExist:
        return Response(
            {'error': 'Room not found'},
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['GET'])
@permission_classes([AllowAny])
def room_participants(request, room_id):
    """Get participants for a specific room with their roles"""
    try:
        room = Room.objects.get(room_id=room_id)
        participants = Participant.objects.filter(room=room)
        
        # Get current user if authenticated
        user = request.user
        current_user_role = None
        
        if user.is_authenticated:
            # check if user is the host
            if room.host and room.host.id == user.id:
                current_user_role = 'host'
            else:
                # check if user is a participant with another role
                try:
                    participant = Participant.objects.get(room=room, user=user)
                    current_user_role = participant.role
                except Participant.DoesNotExist:
                    # default to viewer if no role found
                    current_user_role = 'viewer'
        
        participants_data = []
        for participant in participants:
            # isCurrentUser flag based on user ID match
            is_current_user = user.is_authenticated and participant.user.id == user.id
            
            # If this participant is the current user, update current_user_role as a fallback
            if is_current_user and not current_user_role:
                current_user_role = participant.role
                
            participants_data.append({
                'id': participant.id,
                'userId': participant.user.id,
                'username': participant.user.username,
                'role': participant.role,
                'joinedAt': participant.joined_at,
                'lastActive': participant.last_active,
                'isCurrentUser': is_current_user
            })
        
        # If current user isn't in participants yet, add them temporarily
        if user.is_authenticated and not any(p['userId'] == user.id for p in participants_data):
            # Try once more to determine role if there isnt one
            if not current_user_role:
                if room.host and room.host.id == user.id:
                    current_user_role = 'host'
                else:
                    current_user_role = 'viewer' 
            
            participants_data.append({
                'id': 'temp-' + str(user.id),
                'userId': user.id,
                'username': user.username,
                'role': current_user_role,
                'joinedAt': timezone.now().isoformat(),
                'lastActive': timezone.now().isoformat(),
                'isCurrentUser': True,
                'isTemporary': True
            })
        
        
        return Response({
            'roomId': room.room_id,
            'participants': participants_data,
            'currentUserRole': current_user_role
        })
        
    except Room.DoesNotExist:
        return Response(
            {'error': 'Room not found'},
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['DELETE'])
@permission_classes([AllowAny])
def delete_room(request, room_id):
    """Delete a room and clean up resources"""
    try:
        room = Room.objects.get(room_id=room_id)
        
        # Check if authenticated user is host
        user = request.user
        if user.is_authenticated and room.host != user:
            return Response(
                {'error': 'Only the host can delete a room'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        
        #  disconnect all participants from LiveKit
        try:
            # Delete from LiveKit
            @sync_livekit
            async def delete_livekit_room():
                async with get_livekit_client() as client:
                    await client.room.delete_room(
                        DeleteRoomRequest(room=room_id)
                    )
            
            delete_livekit_room()
        except Exception:
            logger.exception("Error with LiveKit room deletion")
            # Continue with local deletion even if LiveKit deletion fails
        
        # Remove all participants from database
        Participant.objects.filter(room=room).delete()
        
        # Mark as inactive and then delete from database
        room.is_active = False
        room.save()
        room.delete()
        
        return Response({'success': True})
        
    except Room.DoesNotExist:
        return Response(
            {'error': 'Room not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.exception("Error deleting room")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([AllowAny])  # Temporarily allow any user for testing
def create_room(request):
    """Create a new LiveKit room with user as host"""
    name = request.data.get('name', '')
    research_interests = request.data.get('research_interests', [])
    
    if not name:
        return Response({'error': 'Room name is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    
    user_id = str(request.user.id)
    room_id = user_id
    
    
    # Create the LiveKit room via API
    try:
        # check if a room with this ID already exists for this user
        try:
            existing_room = Room.objects.get(room_id=room_id)
            # if room exists but is not active, reactivate it
            if not existing_room.is_active:
                existing_room.is_active = True
                existing_room.name = name
                existing_room.save()
                
                # update research interests
                if research_interests:
                    existing_room.research_interests.clear()
                    from authentication.models import ResearchInterest
                    for interest_name in research_interests:
                        interest, _ = ResearchInterest.objects.get_or_create(name=interest_name)
                        existing_room.research_interests.add(interest)
                
                # get research interests for response
                interests = [interest.name for interest in existing_room.research_interests.all()]
                
                return Response({
                    'id': existing_room.id,
                    'name': existing_room.name,
                    'room_id': existing_room.room_id,
                    'created_at': existing_room.created_at,
                    'research_interests': interests
                }, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'You already have an active room'}, status=status.HTTP_400_BAD_REQUEST)
        except Room.DoesNotExist:
            # room doesn't exist, continue with creation
            pass
        
        # Create room in LiveKit - using CreateRoomRequest directly instead of api.proto_room
        room_request = CreateRoomRequest(
            name=room_id,
            empty_timeout=300,  # 5 minutes
            max_participants=100,
            metadata=json.dumps({
                'creatorId': user_id,
                'title': name
            })
        )
        
        # Create a LiveKit client and run the async operation synchronously
        @sync_livekit
        async def create_livekit_room():
            async with get_livekit_client() as client:
                return await client.room.create_room(room_request)
        
        create_livekit_room()
        
        # create room in database
        room = Room.objects.create(
            name=name,
            room_id=user_id,
            host=request.user,
            metadata={
                'title': name,
                'creatorId': user_id
            }
        )
        
        # add research interests if provided
        if research_interests:
            from authentication.models import ResearchInterest
            for interest_name in research_interests:
                interest, _ = ResearchInterest.objects.get_or_create(name=interest_name)
                room.research_interests.add(interest)
        
        # create participant entry for the host
        Participant.objects.create(
            room=room,
            user=request.user,
            role='host'
        )
        
        
        # get research interests for response
        interests = [interest.name for interest in room.research_interests.all()]
        
        return Response({
            'id': room.id,
            'name': room.name,
            'room_id': room.room_id,
            'created_at': room.created_at,
            'host_id': str(room.host.id),
            'research_interests': interests
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.exception("Error creating room")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_room_token(request, room_id):
    """Generate a LiveKit token with appropriate permissions based on role"""
    try:
        room = Room.objects.get(room_id=room_id)
        
        user = request.user
        
        # Get requested role and username from query params
        requested_role = request.query_params.get('role', 'viewer')
        username = request.query_params.get('username', '')
        
        # Validate the requested role
        valid_roles = ['host', 'moderator', 'guest', 'viewer']
        if requested_role not in valid_roles:
            requested_role = 'viewer'
        
        
        if user.is_authenticated:
            if requested_role == 'host' and room.host != user:
                requested_role = 'viewer'
                
            participant, created = Participant.objects.get_or_create(
                room=room,
                user=user,
                defaults={'role': requested_role}
            )
            
            if participant.role != 'host':
                participant.role = requested_role
                participant.save()
                
            identity = str(user.id)
            name = user.username
        else:
            # Anonymous users always get viewer role
            requested_role = 'viewer'
            identity = f"anonymous-{uuid.uuid4()}"
            
            if username:
                name = username
            else:
                name = f"Viewer-{identity[:8]}"
            
            # Create a temporary user for the anonymous participant
            from django.contrib.auth import get_user_model
            User = get_user_model()
            temp_user, created = User.objects.get_or_create(
                username=identity,
                defaults={
                    'email': f"{identity}@anonymous.user"
                }
            )
            
            # Then create the participant with the temporary user
            participant, created = Participant.objects.get_or_create(
                room=room,
                user=temp_user,
                defaults={'role': 'viewer'}
            )
        
        # Create token with appropriate permissions
        token = AccessToken(
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET
        )
        
        token.with_identity(identity)
        token.with_name(name)
        
        can_publish = True
        room_admin = requested_role == 'host'
        
        
        grants = VideoGrants(
            room=room_id,
            room_join=True,
            room_admin=room_admin,
            can_publish=can_publish,
            can_subscribe=True,
            can_publish_data=True
        )
        
        # Admin rights already set above
        
        token.with_grants(grants)
        
        return Response({
            'token': token.to_jwt(), 
            'room_id': room_id,
            'role': requested_role,
            'name': name,
            'identity': identity,
            'can_publish': can_publish 
        })
        
    except Room.DoesNotExist:
        return Response({'error': 'Room not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
@api_view(['POST', 'GET'])
@permission_classes([AllowAny])
def webhook(request):
    """Handle LiveKit webhooks for participant and room events"""
    
    try:
        if request.method == 'GET':
            
            
            return Response(
                {'success': True, 'message': 'Webhook endpoint is active and receiving GET requests'}, 
                status=status.HTTP_200_OK
            )
        
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.error("Webhook received with invalid authorization header")
            return Response(
                {'error': 'Invalid authorization header'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Parse the request body
        body_data = request.body
        
        
        # Parse JSON data
        try:
            event_data = json.loads(body_data.decode('utf-8'))
        except json.JSONDecodeError as e:
            logger.exception("[WEBHOOK] Error parsing JSON data")
            return Response(
                {'error': f'Invalid JSON data: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the event type
        event_type = event_data.get('event')
        
        # Log events differently based on type
        if event_type == 'room_finished':
            handle_room_finished(event_data)

        elif event_type == 'participant_joined':
            handle_participant_joined(event_data)

        elif event_type == 'participant_left':
            handle_participant_left(event_data)
        
        # Return success
        return Response({'success': True})
    
    except Exception as e:
        logger.exception("Webhook error")
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def share_extract_in_room(request, room_id):
    """Share a paper extract in a livestream room"""
    try:
        # Get the room
        room = Room.objects.get(room_id=room_id)
        
        # Get user and verify permissions
        user = request.user
        
        # Check if user is participant in this room
        try:
            participant = Participant.objects.get(room=room, user=user)
            if participant.role not in ['host', 'guest']:
                return Response(
                    {'error': 'Only hosts and guests can share extracts in a room'},
                    status=status.HTTP_403_FORBIDDEN
                )
        except Participant.DoesNotExist:
            return Response(
                {'error': 'You are not a participant in this room'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get extract data from request
        extract_id = request.data.get('id')
        
        # Check if this extract already exists and belongs to the user
        paper_extract = None
        if extract_id:
            try:
                paper_extract = PaperExtract.objects.get(id=extract_id, user=user)
            except PaperExtract.DoesNotExist:
                return Response(
                    {'error': 'Extract not found or not owned by you'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        
        # Create SharedExtract record
        shared_extract = SharedExtract.objects.create(
            room=room,
            shared_by=user,
            title=request.data.get('title', ''),
            authors=request.data.get('authors', ''),
            doi=request.data.get('doi', ''),
            link=request.data.get('link', ''),
            pdf_link=request.data.get('pdf_link', ''),
            extract=request.data.get('extract', ''),
            page_number=request.data.get('page_number', ''),
            original_extract=paper_extract
        )
        
        
        # Return the created extract
        return Response({
            'extract': {
                'id': shared_extract.id,
                'title': shared_extract.title,
                'authors': shared_extract.authors,
                'doi': shared_extract.doi,
                'link': shared_extract.link,
                'pdf_link': shared_extract.pdf_link,
                'publication_link': shared_extract.link,
                'extract': shared_extract.extract,
                'page_number': shared_extract.page_number,
                'shared_by': shared_extract.shared_by.username,
                'shared_at': shared_extract.shared_at.isoformat()
            }
        }, status=status.HTTP_201_CREATED)
        
    except Room.DoesNotExist:
        return Response(
            {'error': 'Room not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.exception("Error sharing extract")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([AllowAny])
def get_room_extracts(request, room_id):
    """Get all shared extracts for a specific room"""
    try:
        # Get the room
        room = Room.objects.get(room_id=room_id)
        
        # Get all shared extracts for this room
        shared_extracts = SharedExtract.objects.filter(room=room).order_by('shared_at')
        
        # Format response
        extracts_data = []
        for extract in shared_extracts:
            extracts_data.append({
                'id': extract.id,
                'title': extract.title,
                'authors': extract.authors,
                'doi': extract.doi,
                'link': extract.link,
                'pdf_link': extract.pdf_link,
                'publication_link': extract.link,  # Use link as fallback
                'extract': extract.extract,
                'page_number': extract.page_number,
                'shared_by': extract.shared_by.username,
                'shared_at': extract.shared_at.isoformat()
            })
        
        return Response({
            'room_id': room_id,
            'extracts': extracts_data
        })
        
    except Room.DoesNotExist:
        return Response(
            {'error': 'Room not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.exception("Error getting room extracts")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([AllowAny])
def update_participant_role(request, room_id, participant_id):
    """Update a participant's role - only hosts can promote viewers to guests"""
    try:
        # Get the room
        room = Room.objects.get(room_id=room_id)
        
        # Get the authenticated user
        user = request.user
        
        # Check if the user is authenticated and is the host
        if not user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Verify the user is the host of this room
        if room.host != user:
            return Response({'error': 'Only the host can update participant roles'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get the new role from the request
        new_role = request.data.get('role')
        if not new_role or new_role not in ['guest', 'viewer']:
            return Response({'error': 'Invalid role. Only "guest" or "viewer" roles are allowed'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Find the participant by ID
        try:
            participant = Participant.objects.get(id=participant_id, room=room)
        except Participant.DoesNotExist:
            return Response({'error': 'Participant not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Don't allow changing host roles
        if participant.role == 'host':
            return Response({'error': 'Cannot change role of a host'}, status=status.HTTP_403_FORBIDDEN)
        
        # Update the role
        participant.role = new_role
        participant.save()
        
        
        # Return success
        return Response({
            'success': True,
            'message': f'Successfully updated participant role to {new_role}',
            'participant': {
                'id': participant.id,
                'userId': participant.user.id,
                'username': participant.user.username,
                'role': participant.role
            }
        })
        
    except Room.DoesNotExist:
        return Response({'error': 'Room not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.exception("Error updating participant role")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def research_interests(request):
    """Get all research interests in the system"""
    from authentication.models import ResearchInterest
    
    interests = ResearchInterest.objects.all().order_by('name')
    interest_names = [interest.name for interest in interests]
    
    return Response(interest_names)


