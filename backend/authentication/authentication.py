from rest_framework import authentication
from rest_framework import exceptions
from firebase_admin import auth
from .models import User

BEARER_PREFIX = 'Bearer '


def bearer_token(request):
    """The token of an `Authorization: Bearer <token>` header, or None when there is no such header."""
    header = request.META.get('HTTP_AUTHORIZATION', '')
    return header[len(BEARER_PREFIX):] if header.startswith(BEARER_PREFIX) else None


def verify_firebase_token(token):
    """Decoded claims of a Firebase ID token. Raises AuthenticationFailed when the token is invalid or expired.

    Other errors (Firebase unreachable, certificates not fetchable) are server problems and propagate.
    """
    try:
        return auth.verify_id_token(token)
    except (ValueError, auth.InvalidIdTokenError):
        raise exceptions.AuthenticationFailed('Invalid or expired Firebase token')


class FirebaseAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication class for DRF that authenticates using Firebase tokens.
    """

    def authenticate(self, request):
        token = bearer_token(request)
        if token is None:
            return None

        decoded_token = verify_firebase_token(token)
        try:
            user = User.objects.get(firebase_uid=decoded_token.get('uid'))
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed('User is authenticated with Firebase but not registered')
        return (user, token)

    def authenticate_header(self, request):
        return 'Bearer'
