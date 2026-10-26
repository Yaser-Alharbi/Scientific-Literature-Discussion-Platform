# backend/authentication/views.py

from django.shortcuts import render
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from firebase_admin import auth
from .models import User, ResearchInterest
import logging
logger = logging.getLogger(__name__)
# Create your views here.

# first name and last name

@api_view(['POST'])
@authentication_classes([]) # the caller has no Django user yet, so FirebaseAuthentication must not run
@permission_classes([AllowAny]) # allow any user to register, if I dont put this here there would be a chicken and egg problem. User needs to register before they can login.
def register(request):
    try:
        token = request.headers['Authorization'].split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        
        data = request.data
        auth_method = data.get('auth_methods', 'email').lower()
        
        # Extract email
        email = decoded_token.get('email')
        
        # Get names from token for Google users
        first_name = ''
        last_name = ''
        
        if auth_method == 'google':
            first_name = decoded_token.get('name', '').split(' ')[0] if decoded_token.get('name') else ''
            last_name_parts = decoded_token.get('name', '').split(' ')[1:] if decoded_token.get('name') else []
            last_name = ' '.join(last_name_parts)
        else:
            # For email users, use data from request
            first_name = data.get('first_name', '')
            last_name = data.get('last_name', '')
        
        try:
            user = User.objects.get(firebase_uid=decoded_token['uid'])
            if data.get('password'):
                user.set_password(data['password'])
                user.save()
                return Response({"message": "Password updated"})
        except User.DoesNotExist:
            # Create new user
            user = User.objects.create(
                firebase_uid=decoded_token['uid'],
                email=email,
                username=email,
                first_name=first_name,
                last_name=last_name,
                institution=data.get('institution', ''),
                bio=data.get('bio', ''),
                auth_methods=auth_method.upper(),
                password_set=True if data.get('password') else False
            )

            if data.get('password') and auth_method != 'google':
                user.set_password(data['password'])
                user.save()

        return Response({"message": "User created/updated successfully"})
    except Exception as e:
        logger.exception("Registration error")
        return Response({"error": str(e)}, status=500)



@api_view(['GET'])
def user_profile(request):
    user = request.user
    return Response({
        'email': user.email,
        'institution': user.institution,
        'bio': user.bio,
        'research_interests': list(user.research_interests.values_list('name', flat=True)),
        'auth_methods': user.auth_methods,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'password_set': user.password_set
    })


@api_view(['POST'])
def set_password(request):
    password = request.data.get('password')
    if not password:
        return Response({"error": "No password provided"}, status=400)

    user = request.user
    user.set_password(password)
    user.password_set = True
    if 'EMAIL' not in user.auth_methods:
        user.auth_methods = user.auth_methods + 'EMAIL'
    user.save()
    return Response({"message": "Password updated successfully"})


@api_view(['POST'])
def update_profile(request):
    user = request.user
    data = request.data

    if 'institution' in data:
        user.institution = data['institution']
    if 'bio' in data:
        user.bio = data['bio']
    if 'first_name' in data:
        user.first_name = data['first_name']
    if 'last_name' in data:
        user.last_name = data['last_name']

    user.save()

    if 'research_interests' in data and isinstance(data.get('research_interests'), list):
        user.research_interests.clear()
        for interest_name in data['research_interests']:
            interest, _ = ResearchInterest.objects.get_or_create(name=interest_name)
            user.research_interests.add(interest)

    return Response({
        'email': user.email,
        'institution': user.institution,
        'bio': user.bio,
        'research_interests': list(user.research_interests.values_list('name', flat=True)),
        'first_name': user.first_name,
        'last_name': user.last_name,
        'password_set': user.password_set
    })


@api_view(['GET'])
def get_research_interests(request):
    try:
        interests = ResearchInterest.objects.all().order_by('name')
        interest_names = [interest.name for interest in interests]
        return Response(interest_names)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

    
@api_view(['POST'])
@permission_classes([AllowAny])
def sync_reset_password(request):
    try:
        email = request.data.get('email')
        password = request.data.get('password')

        user = User.objects.get(email=email)
        user.set_password(password)
        user.save()
        
        return Response({"message": "Password synced successfully"})
            
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
