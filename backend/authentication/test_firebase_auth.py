# backend/authentication/test_firebase_auth.py
"""FirebaseAuthentication, exercised through GET /api/user-profile."""

from authentication.models import User
from testsupport.api import FirebaseApiCase, make_user


class FirebaseAuthenticationTests(FirebaseApiCase):
    def setUp(self):
        super().setUp()
        self.alice = make_user('alice')
        self.bob = make_user('bob')

    def test_valid_token_authenticates_the_user_with_that_uid(self):
        # catches: user looked up by anything but the token's uid (e.g. the first user)
        response = self.call('get', '/api/user-profile', 'tok-bob')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['email'], 'bob@example.com')

    def test_missing_header_is_401(self):
        response = self.call('get', '/api/user-profile')
        self.assertEqual(response.status_code, 401)

    def test_missing_header_response_asks_for_a_bearer_token(self):
        # catches: authenticate_header removed, which turns the 401 into a 403
        response = self.call('get', '/api/user-profile')
        self.assertEqual(response['WWW-Authenticate'], 'Bearer')

    def test_non_bearer_scheme_is_401(self):
        # catches: the scheme ignored, so "Basic tok-alice" authenticates
        response = self.client.get('/api/user-profile', HTTP_AUTHORIZATION='Basic tok-alice')
        self.assertEqual(response.status_code, 401)

    def test_invalid_token_is_401(self):
        response = self.call('get', '/api/user-profile', 'not-a-token')
        self.assertEqual(response.status_code, 401)

    def test_valid_token_of_unregistered_uid_is_401_and_creates_no_user(self):
        # catches: an unregistered uid falling back to another user, or being auto-created
        response = self.call('get', '/api/user-profile', 'tok-gina')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(User.objects.count(), 2)
