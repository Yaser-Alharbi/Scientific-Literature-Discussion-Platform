# backend/livestream/webhook_events.py

import logging
from livekit.api.room_service import DeleteRoomRequest, ListParticipantsRequest
from .models import Room, Participant
from .services import sync_livekit, get_livekit_client

logger = logging.getLogger(__name__)


def handle_room_finished(event_data):
    room_info = event_data.get('room', {})
    room_name = room_info.get('name')
    
    # Mark room as inactive in database
    try:
        room = Room.objects.get(room_id=room_name)
        room.is_active = False
        room.save()
        
        # Clear all participants for this room
        Participant.objects.filter(room=room).delete()
        
    except Room.DoesNotExist:
        logger.warning(f"[ROOM FINISHED] Room {room_name} not found in database")


def handle_participant_joined(event_data):
    room_info = event_data.get('room', {})
    participant_info = event_data.get('participant', {})
    
    room_name = room_info.get('name')
    participant_identity = participant_info.get('identity')
    
    # Make sure participant is in database
    if room_name and participant_identity:
        try:
            room = Room.objects.get(room_id=room_name)
            
            # Get user
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            try:
                user = User.objects.get(id=participant_identity)
                
                # Create participant if doesn't exist
                Participant.objects.get_or_create(
                    room=room,
                    user=user,
                    defaults={'role': 'viewer'}  # Default role
                )

            except User.DoesNotExist:
                logger.warning(f"[PARTICIPANT JOINED] User with ID {participant_identity} not found")
        
        except Room.DoesNotExist:
            logger.warning(f"[PARTICIPANT JOINED] Room {room_name} not found in database")


def handle_participant_left(event_data):
    room_info = event_data.get('room', {})
    participant_info = event_data.get('participant', {})
    
    room_name = room_info.get('name')
    participant_identity = participant_info.get('identity')
    participant_name = participant_info.get('name', 'Unknown')
    
    
    if room_name:
        try:
            room = Room.objects.get(room_id=room_name)
            
            # Remove participant from database if they exist
            if participant_identity or participant_name:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                
                # Try multiple ways to find the participant
                try:
                    # First try to find by identity (user id)
                    if participant_identity:
                        try:
                            user = User.objects.get(id=participant_identity)
                            participant_found = Participant.objects.filter(room=room, user=user).exists()
                            if participant_found:
                                Participant.objects.filter(room=room, user=user).delete()
                                
                                # Check if this was the host
                                if room.host == user:
                                    
                                    # Handle host leaving - mark room inactive and delete all participants
                                    room.is_active = False
                                    room.save()
                                    
                                    # Delete all participants for this room
                                    Participant.objects.filter(room=room).delete()
                                    
                                    # Delete the LiveKit room
                                    try:
                                        @sync_livekit
                                        async def delete_livekit_room():
                                            async with get_livekit_client() as client:
                                                await client.room.delete_room(
                                                    DeleteRoomRequest(room=room_name)
                                                )
                                        
                                        delete_livekit_room()
                                    except Exception:
                                        logger.exception("[PARTICIPANT LEFT] Error deleting LiveKit room")
                                        
                        except User.DoesNotExist:
                            logger.warning(f"[PARTICIPANT LEFT] User with ID {participant_identity} not found")
                    
                    # If not found by ID, try by username/name
                    if participant_name and participant_name != 'Unknown':
                        # Find users with matching username
                        matching_users = User.objects.filter(username=participant_name)
                        
                        if matching_users.exists():
                            for user in matching_users:
                                Participant.objects.filter(room=room, user=user).delete()
                                
                                # Check if the user was a host
                                if room.host == user:
                                    
                                    # Handle host leaving - mark room inactive and delete all participants
                                    room.is_active = False
                                    room.save()
                                    
                                    # Delete all participants for this room
                                    Participant.objects.filter(room=room).delete()
                                    
                                    # Delete the LiveKit room
                                    try:
                                        @sync_livekit
                                        async def delete_livekit_room():
                                            async with get_livekit_client() as client:
                                                await client.room.delete_room(
                                                    DeleteRoomRequest(room=room_name)
                                                )
                                        
                                        delete_livekit_room()
                                    except Exception:
                                        logger.exception("[PARTICIPANT LEFT] Error deleting LiveKit room")
                    
                    # Fallback: try to find anonymous participants
                    if participant_identity and participant_identity.startswith('anonymous-'):
                        # Find users with matching identity in username
                        matching_users = User.objects.filter(username=participant_identity)
                        
                        if matching_users.exists():
                            for user in matching_users:
                                Participant.objects.filter(room=room, user=user).delete()
                            
                except Exception:
                    logger.exception("[PARTICIPANT LEFT] Error removing participant")
            
            # Check current participant count in LiveKit
            @sync_livekit
            async def get_room_participants():
                async with get_livekit_client() as client:
                    participants = await client.room.list_participants(
                        ListParticipantsRequest(room=room_name)
                    )
                    return participants
            
            participants_response = get_room_participants()
            remaining_count = len(participants_response.participants)
            
            # Ensure database count matches LiveKit count
            db_count = Participant.objects.filter(room=room).count()
            
            # If counts don't match, sync them
            if db_count != remaining_count:
                
                # Clear participants for this room and recreate from LiveKit data
                if remaining_count == 0:
                    # If no remaining participants, simple clear the database
                    Participant.objects.filter(room=room).delete()
                    
                    # If LiveKit shows no participants, mark room as inactive
                    room.is_active = False
                    room.save()
                    
                    # delete the room from LiveKit
                    try:
                        @sync_livekit
                        async def delete_livekit_room():
                            async with get_livekit_client() as client:
                                await client.room.delete_room(
                                    DeleteRoomRequest(room=room_name)
                                )
                        
                        delete_livekit_room()
                    except Exception:
                        logger.exception("[PARTICIPANT LEFT] Error deleting LiveKit room")
            
        except Room.DoesNotExist:
            logger.warning(f"[PARTICIPANT LEFT] Room {room_name} not found in database")
