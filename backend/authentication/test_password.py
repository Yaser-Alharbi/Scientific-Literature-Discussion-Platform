# backend/authentication/test_password.py
"""POST /api/set-password and POST /api/sync-reset-password."""

from authentication.models import User
from testsupport.api import FirebaseApiCase, make_user


class SetPasswordTests(FirebaseApiCase):
    def test_email_user_changes_password_and_keeps_auth_methods(self):
        # catches: 'EMAIL' check inverted (would give EMAILEMAIL), password_set not set
        alice = make_user('alice', password_set=False)
        response = self.call('post', '/api/set-password', 'tok-alice', {'password': 'new-pass-9'})
        self.assertEqual((response.status_code, response.json()), (200, {'message': 'Password updated successfully'}))
        alice.refresh_from_db()
        self.assertTrue(alice.check_password('new-pass-9'))
        self.assertTrue(alice.password_set)
        self.assertEqual(alice.auth_methods, 'EMAIL')

    def test_google_user_gains_the_email_method(self):
        gina = make_user('gina', auth_methods='GOOGLE')
        self.call('post', '/api/set-password', 'tok-gina', {'password': 'new-pass-9'})
        gina.refresh_from_db()
        self.assertEqual(gina.auth_methods, 'GOOGLEEMAIL')

    def test_password_is_set_on_the_caller_not_another_user(self):
        # catches: the user looked up as the first row instead of by uid
        bob = make_user('bob')
        alice = make_user('alice')
        self.call('post', '/api/set-password', 'tok-alice', {'password': 'new-pass-9'})
        bob.refresh_from_db()
        alice.refresh_from_db()
        self.assertFalse(bob.check_password('new-pass-9'))
        self.assertTrue(alice.check_password('new-pass-9'))

    def test_missing_password_is_400_and_changes_nothing(self):
        alice = make_user('alice')
        alice.set_password('old-pass')
        alice.save()
        response = self.call('post', '/api/set-password', 'tok-alice', {})
        self.assertEqual((response.status_code, response.json()), (400, {'error': 'No password provided'}))
        alice.refresh_from_db()
        self.assertTrue(alice.check_password('old-pass'))

    def test_empty_password_is_400_and_changes_nothing(self):
        # catches: an empty string accepted, which would store a password that matches ''
        alice = make_user('alice')
        alice.set_password('old-pass')
        alice.save()
        response = self.call('post', '/api/set-password', 'tok-alice', {'password': ''})
        self.assertEqual(response.status_code, 400)
        alice.refresh_from_db()
        self.assertTrue(alice.check_password('old-pass'))

    def test_unauthenticated_is_401(self):
        self.assertEqual(self.call('post', '/api/set-password', None, {'password': 'x'}).status_code, 401)


class SyncResetPasswordTests(FirebaseApiCase):
    def test_authenticated_reset_with_own_email_changes_that_users_password(self):
        # catches: the save dropped, or the user chosen as the first row instead of by email
        bob = make_user('bob')
        alice = make_user('alice')
        response = self.call('post', '/api/sync-reset-password', 'tok-alice',
                             {'email': 'alice@example.com', 'password': 'reset-pw-5'})
        self.assertEqual((response.status_code, response.json()), (200, {'message': 'Password synced successfully'}))
        alice.refresh_from_db()
        bob.refresh_from_db()
        self.assertTrue(alice.check_password('reset-pw-5'))
        self.assertFalse(bob.check_password('reset-pw-5'))

    def test_unknown_email_is_404(self):
        make_user('alice')
        response = self.call('post', '/api/sync-reset-password', 'tok-alice',
                             {'email': 'nobody@example.com', 'password': 'x-pass-1'})
        self.assertEqual((response.status_code, response.json()), (404, {'error': 'User not found'}))
        self.assertEqual(User.objects.count(), 1)
