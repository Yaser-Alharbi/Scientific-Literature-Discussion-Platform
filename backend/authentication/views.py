# backend/authentication/views.py

from django.shortcuts import render
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotAuthenticated, ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from firebase_admin import auth
from .models import User, ResearchInterest
from .authentication import FirebaseTokenAuthentication
from .serializers import ProfileUpdateSerializer, RegisterSerializer, UserProfileSerializer
import logging
logger = logging.getLogger(__name__)
# Create your views here.

@api_view(['POST'])
@authentication_classes([FirebaseTokenAuthentication])  # the caller has no Django user yet
@permission_classes([AllowAny])  # permission comes from the Firebase token checked below, not from a Django user
def register(request):
    claims = request.auth
    if claims is None:
        raise NotAuthenticated()
    email = claims.get('email')
    if not email:
        raise ValidationError({'email': 'The Firebase token has no email address.'})

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    auth_method = data['auth_methods'].lower()
    is_google = auth_method == 'google'
    password = data['password']

    if is_google:
        name_parts = claims.get('name', '').split(' ')
        first_name, last_name = name_parts[0], ' '.join(name_parts[1:])
    else:
        first_name, last_name = data['first_name'], data['last_name']

    user, created = User.objects.get_or_create(
        firebase_uid=claims['uid'],
        defaults={
            'email': email,
            'username': email,
            'first_name': first_name,
            'last_name': last_name,
            'institution': data['institution'],
            'bio': data['bio'],
            'auth_methods': auth_method.upper(),
            # Google accounts have no password of their own, so a posted one is ignored
            'password_set': bool(password) and not is_google,
        },
    )

    if not created and password:
        user.set_password(password)
        user.save()
        return Response({"message": "Password updated"})
    if created and password and not is_google:
        user.set_password(password)
        user.save()
    return Response({"message": "User created/updated successfully"})


@api_view(['GET'])
def user_profile(request):
    return Response(UserProfileSerializer(request.user).data)


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
    # The frontend only ever sends a list; anything else is treated as "interests not part of this update".
    payload = {k: v for k, v in request.data.items() if k != 'research_interests' or isinstance(v, list)}
    serializer = ProfileUpdateSerializer(data=payload)
    serializer.is_valid(raise_exception=True)
    changes = dict(serializer.validated_data)
    interest_names = changes.pop('research_interests', None)

    user = request.user
    with transaction.atomic():
        for field, value in changes.items():
            setattr(user, field, value)
        user.save()
        if interest_names is not None:
            user.research_interests.set(
                [ResearchInterest.objects.get_or_create(name=name)[0] for name in interest_names]
            )

    return Response(UserProfileSerializer(user).data)


@api_view(['GET'])
def get_research_interests(request):
    try:
        interests = ResearchInterest.objects.all().order_by('name')
        interest_names = [interest.name for interest in interests]
        return Response(interest_names)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

    
@api_view(['POST'])
def sync_reset_password(request):
    # The reset page signs in with the new password first, so the caller is always authenticated.
    password = request.data.get('password')
    if not password:
        return Response({"error": "No password provided"}, status=400)

    request.user.set_password(password)
    request.user.save()
    return Response({"message": "Password synced successfully"})
