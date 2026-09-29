# backend/authentication/views.py

import time
from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from firebase_admin import auth
from .models import User, ResearchInterest
import logging
logger = logging.getLogger(__name__)
# Create your views here.

# @api_view(['GET'])
# def test_connection(request):
#     return Response({"message": "Connected!"})


@api_view(['GET'])
def verify_token(request):
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header:
            return Response({"error": "No token provided"}, status=401)
        
        token = auth_header.split('Bearer ')[1]
        
        # Verify token
        decoded_token = auth.verify_id_token(token)
        
        # Check for clock skew issues
        current_time = time.time()
        iat = decoded_token.get('iat', 0)
        CLOCK_SKEW_TOLERANCE = 300  # 5 minutes
        
        if iat > current_time + CLOCK_SKEW_TOLERANCE:
            print(f"Clock skew detected: Token issued at {iat}, current time {current_time}")
            return Response({
                "uid": decoded_token["uid"],
                "warning": "Clock skew detected"
            })
        
        return Response({"uid": decoded_token["uid"]})
    except Exception as e:
        print("Token verification error:", str(e))  # Debug print
        return Response({"error": str(e)}, status=401)

# first name and last name

@api_view(['POST'])
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
        print(f"Registration error: {str(e)}")
        return Response({"error": str(e)}, status=500)



@api_view(['GET'])
def user_profile(request):
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header:
            return Response({"error": "No token provided"}, status=401)
            
        token = auth_header.split('Bearer ')[1]
        
        try:
            decoded_token = auth.verify_id_token(token)
        except Exception as token_error:
            logger.error(f"Token verification failed: {str(token_error)}")
            return Response({"error": f"Invalid token: {str(token_error)}"}, status=401)
        
        try:
            user = User.objects.get(firebase_uid=decoded_token['uid'])
            
            research_interests = list(user.research_interests.values_list('name', flat=True))
            
            response_data = {
                'email': user.email,
                'institution': getattr(user, 'institution', None),
                'bio': getattr(user, 'bio', None),
                'research_interests': research_interests,
                'auth_methods': getattr(user, 'auth_methods', None),
                'first_name': getattr(user, 'first_name', None),
                'last_name': getattr(user, 'last_name', None),
                'password_set': getattr(user, 'password_set', False)
            }
            
            return Response(response_data)
            
        except User.DoesNotExist:
            logger.warning(f"User not found for firebase_uid: {decoded_token['uid']}")
            return Response({"error": "User not found"}, status=404)
        except Exception as user_error:
            logger.exception(f"Error retrieving user data: {str(user_error)}")
            return Response({"error": f"User data error: {str(user_error)}"}, status=500)
            
    except Exception as e:
        logger.exception(f"Unhandled exception in user_profile: {str(e)}")
        return Response({"error": "Internal server error"}, status=500)
    

@api_view(['GET'])
def check_user(request):
#    print("Check user endpoint hit")  # Debug print
   try:
       auth_header = request.headers.get('Authorization', '')
       if not auth_header:
           return Response({"error": "No token provided"}, status=401)
           
       token = auth_header.split('Bearer ')[1]
       
       try:
           decoded_token = auth.verify_id_token(token)
           
           try:
               print(f"Token: {decoded_token}")  # Debug print
               user = User.objects.get(firebase_uid=decoded_token['uid'])
               if user.is_active:  # Check profile completion
                   return Response(status=200)
               return Response({"message": "Profile incomplete"}, status=404)
           except User.DoesNotExist:
               return Response({"message": "User not found"}, status=404)
       except Exception as e:
           print(f"Token verification error: {str(e)}")
           return Response({"error": "Invalid token"}, status=401)
   except Exception as e:
       print(f"Unexpected error in check_user: {str(e)}")
       return Response({"error": "Server error"}, status=500)
   
   
@api_view(['POST'])
def set_password(request):
    try:
        token = request.headers['Authorization'].split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        
        user = User.objects.get(firebase_uid=decoded_token['uid'])
        
        if request.data.get('password'):
            user.set_password(request.data['password'])
            user.save()
            user.password_set = True
            if 'EMAIL' not in user.auth_methods:
                user.auth_methods = user.auth_methods + 'EMAIL'
            user.save()
            return Response({"message": "Password updated successfully"})
        else:
            return Response({"error": "No password provided"}, status=400)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(['POST'])
def update_profile(request):
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header:
            return Response({"error": "No token provided"}, status=401)
            
        token = auth_header.split('Bearer ')[1]
        decoded_token = auth.verify_id_token(token)
        
        try:
            user = User.objects.get(firebase_uid=decoded_token['uid'])
            data = request.data
            
            # Update fields
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
                # Clear existing interests
                user.research_interests.clear()
                # Add new interests
                for interest_name in data.get('research_interests', []):
                    interest, created = ResearchInterest.objects.get_or_create(name=interest_name)
                    # just the interest object, not the tuple from get_or_create
                    user.research_interests.add(interest)
            
            research_interests = list(user.research_interests.values_list('name', flat=True))
            
            return Response({
                'email': user.email,
                'institution': user.institution,
                'bio': user.bio,
                'research_interests': research_interests,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'password_set': user.password_set
            })
            
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)
        except Exception as inner_error:
            import traceback
            print(f"Inner profile update error: {str(inner_error)}")
            print(traceback.format_exc())
            return Response({"error": str(inner_error)}, status=500)
            
    except Exception as e:
        import traceback
        print(f"Profile update error: {str(e)}")
        print(traceback.format_exc())
        return Response({"error": str(e)}, status=500)
    
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

        print(f"Syncing password for email: {email}")
        user = User.objects.get(email=email)
        user.set_password(password)
        user.save()
        
        return Response({"message": "Password synced successfully"})
            
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
