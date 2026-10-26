# backend/testsupport/api.py
"""Shared fixture for the authentication endpoint tests: Firebase faked, DRF client ready."""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from authentication.models import User
from testsupport.auth import fake_firebase

TOKENS = {
    'tok-alice': {'uid': 'uid-alice', 'email': 'alice@example.com'},
    'tok-bob': {'uid': 'uid-bob', 'email': 'bob@example.com'},
    'tok-gina': {'uid': 'uid-gina', 'email': 'gina@example.com', 'name': 'Gina Maria Lopez'},
    'tok-solo': {'uid': 'uid-solo', 'email': 'solo@example.com', 'name': 'Solo'},
}


def make_user(name, **fields):
    """A registered user whose firebase uid, email and username follow TOKENS."""
    return User.objects.create(
        firebase_uid=f'uid-{name}', email=f'{name}@example.com', username=f'{name}@example.com',
        auth_methods=fields.pop('auth_methods', 'EMAIL'), **fields,
    )


# the default PBKDF2 hasher costs ~0.1 s per password and the tests only need hashing to be real
@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class FirebaseApiCase(TestCase):
    def setUp(self):
        cm = fake_firebase(TOKENS)
        cm.__enter__()
        self.addCleanup(cm.__exit__, None, None, None)
        self.client = APIClient()

    def call(self, method, path, token=None, data=None):
        extra = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return getattr(self.client, method)(path, data, format='json', **extra)
