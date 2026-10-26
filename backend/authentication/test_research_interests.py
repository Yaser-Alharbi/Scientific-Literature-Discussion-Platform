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
