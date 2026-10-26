# backend/authentication/test_register.py
"""POST /api/register."""

from authentication.models import User
from testsupport.api import FirebaseApiCase, make_user

CREATED = {'message': 'User created/updated successfully'}


class RegisterTests(FirebaseApiCase):
    def register(self, token, data=None):
        return self.call('post', '/api/register', token, data or {})

    def test_email_signup_creates_the_user_from_the_request_and_token(self):
        # catches: wrong username, dropped institution/bio, auth method case, password_set inverted,
        # password not hashed
        response = self.register('tok-alice', {'first_name': 'Alice', 'last_name': 'Smith', 'password': 'pw-1234',
                                               'institution': 'QMUL', 'bio': 'hi'})
        self.assertEqual((response.status_code, response.json()), (200, CREATED))
        user = User.objects.get()
        self.assertEqual(
            (user.firebase_uid, user.email, user.username, user.first_name, user.last_name,
             user.institution, user.bio, user.auth_methods, user.password_set),
            ('uid-alice', 'alice@example.com', 'alice@example.com', 'Alice', 'Smith',
             'QMUL', 'hi', 'EMAIL', True),
        )
        self.assertTrue(user.check_password('pw-1234'))
        self.assertNotEqual(user.password, 'pw-1234')

    def test_signup_without_password_leaves_password_set_false(self):
        self.register('tok-alice', {'first_name': 'Alice'})
        self.assertFalse(User.objects.get().password_set)

    def test_auth_method_defaults_to_email(self):
        self.register('tok-alice', {})
        self.assertEqual(User.objects.get().auth_methods, 'EMAIL')

    def test_auth_method_is_stored_upper_case(self):
        self.register('tok-gina', {'auth_methods': 'Google'})
        self.assertEqual(User.objects.get().auth_methods, 'GOOGLE')

    def test_google_signup_takes_names_from_the_token_not_the_request(self):
        # catches: names read from the body for Google, or the whole tail not kept as last name
        self.register('tok-gina', {'auth_methods': 'google', 'first_name': 'Ignored', 'last_name': 'Ignored'})
        user = User.objects.get()
        self.assertEqual((user.first_name, user.last_name), ('Gina', 'Maria Lopez'))

    def test_google_single_word_name_leaves_last_name_empty(self):
        self.register('tok-solo', {'auth_methods': 'google'})
        user = User.objects.get()
        self.assertEqual((user.first_name, user.last_name), ('Solo', ''))

    def test_email_signup_takes_names_from_the_request_even_if_the_token_has_a_name(self):
        self.register('tok-gina', {'first_name': 'Given', 'last_name': 'Family'})
        user = User.objects.get()
        self.assertEqual((user.first_name, user.last_name), ('Given', 'Family'))

    def test_existing_user_with_password_gets_it_updated_and_no_second_user(self):
        # catches: the existing-user lookup removed, so a second user is created
        alice = make_user('alice')
        response = self.register('tok-alice', {'password': 'pw-new'})
        self.assertEqual((response.status_code, response.json()), (200, {'message': 'Password updated'}))
        self.assertEqual(User.objects.count(), 1)
        alice.refresh_from_db()
        self.assertTrue(alice.check_password('pw-new'))

    def test_existing_user_without_password_is_left_unchanged(self):
        alice = make_user('alice', institution='A')
        response = self.register('tok-alice', {'institution': 'X'})
        self.assertEqual((response.status_code, response.json()), (200, CREATED))
        alice.refresh_from_db()
        self.assertEqual(alice.institution, 'A')


class RegisterRejectionTests(FirebaseApiCase):
    def register(self, token, data=None):
        return self.call('post', '/api/register', token, data or {})

    def test_missing_header_is_401_and_creates_nothing(self):
        # catches: a KeyError on the header answered as 500
        response = self.register(None)
        self.assertEqual((response.status_code, response.json()),
                         (401, {'error': 'Authentication credentials were not provided.'}))
        self.assertEqual(User.objects.count(), 0)

    def test_invalid_token_is_401_and_creates_nothing(self):
        response = self.register('not-a-token')
        self.assertEqual((response.status_code, response.json()),
                         (401, {'error': 'Invalid or expired Firebase token'}))
        self.assertEqual(User.objects.count(), 0)

    def test_token_without_email_is_400_not_a_database_error(self):
        # catches: username=None reaching the database (500 with the constraint text)
        response = self.register('tok-noemail')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.json()['error'])
        self.assertNotIn('constraint', response.json()['error'].lower())
        self.assertEqual(User.objects.count(), 0)

    def test_over_long_institution_is_400(self):
        response = self.register('tok-alice', {'institution': 'x' * 101})
        self.assertEqual(response.status_code, 400)
        self.assertIn('institution', response.json()['error'])
        self.assertEqual(User.objects.count(), 0)

    def test_google_signup_does_not_claim_a_password_was_set(self):
        # catches: password_set True although the password is ignored for Google accounts
        self.register('tok-gina', {'auth_methods': 'google', 'password': 'ignored-1'})
        user = User.objects.get()
        self.assertFalse(user.password_set)
        self.assertFalse(user.check_password('ignored-1'))

    def test_token_is_verified_once_with_the_clock_skew_allowance(self):
        self.register('tok-alice')
        self.assertEqual(self.verify_calls, [{'clock_skew_seconds': 60}])
