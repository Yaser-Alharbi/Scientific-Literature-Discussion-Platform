# backend/authentication/test_profile.py
"""GET /api/user-profile and POST /api/update-profile."""

from unittest import mock

from authentication.models import ResearchInterest, User
from testsupport.api import FirebaseApiCase, make_user

PROFILE_KEYS = {'email', 'institution', 'bio', 'research_interests', 'auth_methods',
                'first_name', 'last_name', 'password_set'}


def give_interests(user, *names):
    for name in names:
        user.research_interests.add(ResearchInterest.objects.get_or_create(name=name)[0])


class UserProfileTests(FirebaseApiCase):
    def test_profile_has_exactly_the_documented_fields_with_the_stored_values(self):
        # catches: first/last names swapped, password_set dropped, or another user's interests returned
        alice = make_user('alice', institution='QMUL', bio='b', first_name='Alice', last_name='Smith',
                          password_set=True)
        bob = make_user('bob')
        give_interests(alice, 'biology', 'zoology')
        give_interests(bob, 'chemistry')
        response = self.call('get', '/api/user-profile', 'tok-alice')
        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(body), PROFILE_KEYS)
        self.assertEqual(sorted(body['research_interests']), ['biology', 'zoology'])
        self.assertEqual(
            {k: body[k] for k in PROFILE_KEYS - {'research_interests'}},
            {'email': 'alice@example.com', 'institution': 'QMUL', 'bio': 'b', 'auth_methods': 'EMAIL',
             'first_name': 'Alice', 'last_name': 'Smith', 'password_set': True},
        )

    def test_user_without_interests_gets_an_empty_list(self):
        make_user('alice')
        give_interests(make_user('bob'), 'chemistry')
        response = self.call('get', '/api/user-profile', 'tok-alice')
        self.assertEqual(response.json()['research_interests'], [])

    def test_unauthenticated_is_401(self):
        self.assertEqual(self.call('get', '/api/user-profile').status_code, 401)


class UpdateProfileTests(FirebaseApiCase):
    def setUp(self):
        super().setUp()
        self.alice = make_user('alice', institution='A', bio='B', first_name='Al', last_name='Sm')

    def refreshed(self):
        return User.objects.get(pk=self.alice.pk)

    def interests(self):
        return set(self.refreshed().research_interests.values_list('name', flat=True))

    def test_partial_update_changes_only_the_given_field(self):
        # catches: every field overwritten when absent from the request
        response = self.call('post', '/api/update-profile', 'tok-alice', {'bio': 'new'})
        user = self.refreshed()
        self.assertEqual(response.status_code, 200)
        self.assertEqual((user.bio, user.institution, user.first_name, user.last_name), ('new', 'A', 'Al', 'Sm'))

    def test_partial_update_of_institution_leaves_bio_alone(self):
        # catches: a field missing from the request being overwritten with an empty value
        self.call('post', '/api/update-profile', 'tok-alice', {'institution': 'MIT'})
        user = self.refreshed()
        self.assertEqual((user.institution, user.bio), ('MIT', 'B'))

    def test_all_text_fields_are_saved_and_echoed(self):
        # catches: the save dropped, so the response shows values that were never stored
        data = {'institution': 'MIT', 'bio': 'x', 'first_name': 'Alan', 'last_name': 'Turing'}
        response = self.call('post', '/api/update-profile', 'tok-alice', data)
        user = self.refreshed()
        self.assertEqual((user.institution, user.bio, user.first_name, user.last_name),
                         ('MIT', 'x', 'Alan', 'Turing'))
        body = response.json()
        self.assertEqual((body['institution'], body['bio'], body['first_name'], body['last_name'],
                          body['email']), ('MIT', 'x', 'Alan', 'Turing', 'alice@example.com'))

    def test_interests_replace_the_previous_ones_without_deleting_rows(self):
        # catches: old interests kept (clear removed)
        give_interests(self.alice, 'old')
        response = self.call('post', '/api/update-profile', 'tok-alice',
                             {'research_interests': ['Neuroscience', 'AI']})
        self.assertEqual(self.interests(), {'Neuroscience', 'AI'})
        self.assertEqual(sorted(response.json()['research_interests']), ['AI', 'Neuroscience'])
        self.assertTrue(ResearchInterest.objects.filter(name='old').exists())

    def test_existing_interest_row_is_reused(self):
        existing = ResearchInterest.objects.create(name='AI')
        self.call('post', '/api/update-profile', 'tok-alice', {'research_interests': ['AI']})
        self.assertEqual(list(ResearchInterest.objects.filter(name='AI').values_list('pk', flat=True)),
                         [existing.pk])
        self.assertEqual(self.interests(), {'AI'})

    def test_empty_list_clears_the_interests(self):
        give_interests(self.alice, 'x')
        self.call('post', '/api/update-profile', 'tok-alice', {'research_interests': []})
        self.assertEqual(self.interests(), set())

    def test_non_list_interests_are_ignored(self):
        # catches: a string iterated character by character into rows "A" and "I"
        give_interests(self.alice, 'x')
        response = self.call('post', '/api/update-profile', 'tok-alice', {'research_interests': 'AI'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.interests(), {'x'})
        self.assertFalse(ResearchInterest.objects.filter(name__in=['A', 'I']).exists())

    def test_email_in_the_request_is_ignored(self):
        self.call('post', '/api/update-profile', 'tok-alice', {'email': 'evil@example.com'})
        self.assertEqual(self.refreshed().email, 'alice@example.com')

    def test_unauthenticated_is_401(self):
        self.assertEqual(self.call('post', '/api/update-profile', None, {'bio': 'x'}).status_code, 401)


class UpdateProfileValidationTests(FirebaseApiCase):
    def setUp(self):
        super().setUp()
        self.alice = make_user('alice', institution='A', bio='B')
        give_interests(self.alice, 'kept')

    def assert_rejected(self, data, field=None):
        response = self.call('post', '/api/update-profile', 'tok-alice', data)
        self.assertEqual(response.status_code, 400)
        error = response.json()['error']
        if field:
            self.assertIn(field, error)
        self.alice.refresh_from_db()
        self.assertEqual((self.alice.institution, self.alice.bio), ('A', 'B'))
        self.assertEqual(set(self.alice.research_interests.values_list('name', flat=True)), {'kept'})

    def test_too_long_institution_is_rejected_and_nothing_changes(self):
        # catches: no length check (SQLite would accept it, PostgreSQL answers 500)
        self.assert_rejected({'institution': 'x' * 101, 'bio': 'changed'}, 'institution')

    def test_too_long_first_name_is_rejected(self):
        self.assert_rejected({'first_name': 'x' * 151}, 'first_name')

    def test_invalid_interest_names_are_rejected_and_nothing_changes(self):
        # catches: blank, whitespace-only, null, non-string or over-long names reaching the database
        for bad in ('x' * 101, '', '   ', None, 7):
            with self.subTest(bad=bad):
                self.assert_rejected({'bio': 'changed', 'research_interests': ['ok', bad]}, 'research_interests')
        self.assertFalse(ResearchInterest.objects.filter(name='ok').exists())

    def test_interest_names_are_trimmed(self):
        # catches: " AI " and "AI" stored as two interests
        response = self.call('post', '/api/update-profile', 'tok-alice', {'research_interests': ['  AI ']})
        self.assertEqual(response.json()['research_interests'], ['AI'])
        self.assertTrue(ResearchInterest.objects.filter(name='AI').exists())
        self.assertFalse(ResearchInterest.objects.filter(name='  AI ').exists())

    def test_response_includes_auth_methods(self):
        response = self.call('post', '/api/update-profile', 'tok-alice', {'bio': 'x'})
        self.assertEqual(set(response.json()), PROFILE_KEYS)
        self.assertEqual(response.json()['auth_methods'], 'EMAIL')

    def test_database_failure_midway_rolls_the_whole_update_back(self):
        # catches: text fields saved and interests cleared before a later write fails
        real = ResearchInterest.objects.get_or_create
        calls = []

        def flaky(**kwargs):
            calls.append(kwargs)
            if len(calls) == 2:
                raise RuntimeError('database went away')
            return real(**kwargs)

        with mock.patch('authentication.views.ResearchInterest.objects.get_or_create', side_effect=flaky):
            with self.assertRaises(RuntimeError):
                self.call('post', '/api/update-profile', 'tok-alice', {'bio': 'changed', 'research_interests': ['a', 'b']})
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.bio, 'B')
        self.assertEqual(set(self.alice.research_interests.values_list('name', flat=True)), {'kept'})
        self.assertFalse(ResearchInterest.objects.filter(name='a').exists())
