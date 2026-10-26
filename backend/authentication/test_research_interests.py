# backend/authentication/test_research_interests.py
"""GET /api/research-interests."""

from authentication.models import ResearchInterest
from testsupport.api import FirebaseApiCase, make_user


class ResearchInterestsTests(FirebaseApiCase):
    def test_names_are_sorted_alphabetically(self):
        # catches: ordering dropped (insertion order returned)
        make_user('alice')
        for name in ('zoology', 'biology', 'chemistry'):
            ResearchInterest.objects.create(name=name)
        response = self.call('get', '/api/research-interests', 'tok-alice')
        self.assertEqual((response.status_code, response.json()), (200, ['biology', 'chemistry', 'zoology']))

    def test_no_interests_gives_an_empty_list(self):
        make_user('alice')
        response = self.call('get', '/api/research-interests', 'tok-alice')
        self.assertEqual((response.status_code, response.json()), (200, []))

    def test_endpoint_is_public(self):
        # catches: the default IsAuthenticated, which made the profile page's token-less request fail with 401
        ResearchInterest.objects.create(name='biology')
        response = self.call('get', '/api/research-interests')
        self.assertEqual((response.status_code, response.json()), (200, ['biology']))

    def test_stale_token_does_not_break_the_public_endpoint(self):
        ResearchInterest.objects.create(name='biology')
        response = self.call('get', '/api/research-interests', 'expired-token')
        self.assertEqual((response.status_code, response.json()), (200, ['biology']))
