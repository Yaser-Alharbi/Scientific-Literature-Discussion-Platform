import logging

from django.contrib.auth.models import AnonymousUser
from rest_framework import authentication
from rest_framework import exceptions
from rest_framework.permissions import AllowAny
from firebase_admin import auth
from .models import User

logger = logging.getLogger(__name__)

BEARER_PREFIX = 'Bearer '
# a server clock a few seconds behind Google's would otherwise reject fresh tokens as issued in the future
CLOCK_SKEW_SECONDS = 60


def bearer_token(request):
    """The token of an `Authorization: Bearer <token>` header, or None when there is no such header."""
    header = request.META.get('HTTP_AUTHORIZATION', '')
    return header[len(BEARER_PREFIX):] if header.startswith(BEARER_PREFIX) else None


def verify_firebase_token(token):
    """Decoded claims of a Firebase ID token. Raises AuthenticationFailed when the token is invalid or expired.

    Other errors (Firebase unreachable, certificates not fetchable) are server problems and propagate.
    """
    try:
        return auth.verify_id_token(token, clock_skew_seconds=CLOCK_SKEW_SECONDS)
    except (ValueError, auth.InvalidIdTokenError) as e:
        logger.warning('Rejected Firebase token: %s', e)
        raise exceptions.AuthenticationFailed('Invalid or expired Firebase token')


class FirebaseAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication class for DRF that authenticates using Firebase tokens.
    """

    def authenticate(self, request):
        token = bearer_token(request)
        if token is None:
            return None

        try:
            decoded_token = verify_firebase_token(token)
            try:
                user = User.objects.get(firebase_uid=decoded_token.get('uid'))
            except User.DoesNotExist:
                logger.warning('Firebase uid %s has no Django user', decoded_token.get('uid'))
                raise exceptions.AuthenticationFailed('User is authenticated with Firebase but not registered')
        except exceptions.AuthenticationFailed:
            # Frontend calls may still carry a stale persisted token; where anonymous access is fine, that must
            # not turn into a 401. Protected views keep the distinct 401 message.
            if self._allows_anonymous(request):
                return None
            raise
        return (user, token)

    @staticmethod
    def _allows_anonymous(request):
        view = request.parser_context['view']
        return any(isinstance(permission, AllowAny) for permission in view.get_permissions())

    def authenticate_header(self, request):
        return 'Bearer'


class FirebaseTokenAuthentication(authentication.BaseAuthentication):
    """Verifies the Firebase token without requiring a Django user, for the register endpoint.

    request.auth holds the decoded claims; request.user stays anonymous.
    """

    def authenticate(self, request):
        token = bearer_token(request)
        if token is None:
            return None
        return (AnonymousUser(), verify_firebase_token(token))

    def authenticate_header(self, request):
        return 'Bearer'
