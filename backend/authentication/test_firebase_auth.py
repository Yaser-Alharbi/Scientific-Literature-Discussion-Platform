# backend/authentication/test_firebase_auth.py
"""FirebaseAuthentication, exercised through GET /api/user-profile."""

from firebase_admin import auth

from authentication.models import User
from testsupport.auth import fake_firebase
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

    def test_token_scheme_header_is_401_not_a_crash(self):
        # catches: TokenAuthentication in the defaults without rest_framework.authtoken installed,
        # which raised AttributeError for any "Authorization: Token ..." header
        response = self.client.get('/api/user-profile', HTTP_AUTHORIZATION='Token abc')
        self.assertEqual(response.status_code, 401)

    def test_invalid_token_says_so(self):
        # catches: the generic "credentials were not provided" message for a bad token
        response = self.call('get', '/api/user-profile', 'not-a-token')
        self.assertEqual(response.json(), {'error': 'Invalid or expired Firebase token'})

    def test_expired_token_is_401_with_the_same_message(self):
        # catches: only ValueError handled, so Firebase's own InvalidIdTokenError family escapes
        with fake_firebase({}, error=auth.ExpiredIdTokenError('Token expired', cause=None)):
            response = self.call('get', '/api/user-profile', 'tok-alice')
        self.assertEqual((response.status_code, response.json()),
                         (401, {'error': 'Invalid or expired Firebase token'}))

    def test_unregistered_uid_says_the_user_is_not_registered(self):
        response = self.call('get', '/api/user-profile', 'tok-gina')
        self.assertEqual(response.json(), {'error': 'User is authenticated with Firebase but not registered'})

    def test_firebase_outage_is_not_reported_as_a_bad_token(self):
        # catches: a blanket except turning a certificate fetch failure into a 401
        outage = auth.CertificateFetchError('cannot fetch certificates', cause=None)
        with fake_firebase({}, error=outage):
            with self.assertRaises(auth.CertificateFetchError):
                self.call('get', '/api/user-profile', 'tok-alice')

    def test_invalid_token_on_a_public_view_is_401_not_anonymous(self):
        # pins the decision that a bad token is always rejected, even where anonymous access is allowed
        response = self.call('get', '/api/livestream/rooms/', 'not-a-token')
        self.assertEqual(response.status_code, 401)
