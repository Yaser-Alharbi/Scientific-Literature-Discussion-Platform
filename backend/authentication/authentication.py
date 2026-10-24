from rest_framework import authentication
from rest_framework import exceptions
from firebase_admin import auth
from .models import User

class FirebaseAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication class for DRF that authenticates using Firebase tokens.
    """
    
    def authenticate(self, request):
        
        # Get the auth header
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            return None
            
        # extract token
        try:
            token = auth_header.split('Bearer ')[1]
        except IndexError:
            return None
            
        # verify token with firebase
        try:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token.get('uid')
            
            # get or create user
            try:
                user = User.objects.get(firebase_uid=uid)
            except User.DoesNotExist:
                raise exceptions.AuthenticationFailed('User authenticated with Firebase but not found in Django database')
                
            # return authenticated user
            return (user, token)
        except Exception as e:
            print(f"Firebase auth error: {str(e)}")
            return None
    
    def authenticate_header(self, request):
        return 'Bearer'