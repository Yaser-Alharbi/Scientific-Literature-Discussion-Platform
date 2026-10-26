# backend/papers/tests/test_search_view.py
"""Characterization tests for GET /api/papers/search/, through the real URLconf and auth."""

import requests
from django.test import TestCase, override_settings

from authentication.models import User
from papers.tests.base import CROSSREF, SERPAPI, UNPAYWALL, FakedNetworkMixin, fixture
from testsupport.auth import fake_firebase
from testsupport.fakes import make_response

URL = '/api/papers/search/'
RATE_LIMIT_MESSAGE = 'Rate limit exceeded. Please wait a moment before trying again.'


@override_settings(
    SERPAPI_KEY='serp-key-literal',
    CROSSREF_EMAIL='crossref@example.test',
    UNPAYWALL_EMAIL='unpaywall@example.test',
)
class SearchViewTests(FakedNetworkMixin, TestCase):
    def setUp(self):
        super().setUp()
        User.objects.create(username='alice', auth_methods='email', firebase_uid='uid-alice')
        User.objects.create(username='bob', auth_methods='email', firebase_uid='uid-bob')
        self.enterContext(fake_firebase({'tok-alice': 'uid-alice', 'tok-bob': 'uid-bob'}))

    def search(self, query='graph neural networks', token='tok-alice'):
        extra = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        params = {'query': query} if query is not None else {}
        return self.client.get(URL, params, **extra)

    def empty_serp_page(self):
        return make_response(200, {'search_metadata': {'status': 'Success'}})

    def test_request_without_token_is_unauthorized(self):
        # catches: M30 (search open to anonymous users)
        response = self.search(token=None)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.http.calls, [])

    def test_missing_query_is_a_400_and_spends_no_serpapi_call(self):
        # catches: the query guard removed, which would spend a paid SerpAPI call
        response = self.search(query=None)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'error': 'Query parameter is required'})
        self.assertEqual(self.http.calls, [])

    def test_search_calls_serpapi_once_and_enriches_every_result(self):
        # catches: M27 (num changed), M28 (unpaywall step dropped), a wrong engine / query / key
        gcn = fixture('crossref_works')
        gcn['message']['items'][0]['DOI'] = '10.1000/gcn.2016.2'
        self.http.queue(SERPAPI, make_response(200, fixture('serpapi_scholar')))
        self.http.queue(CROSSREF, make_response(200, fixture('crossref_works')), make_response(200, gcn))
        self.http.queue(
            UNPAYWALL,
            make_response(200, fixture('unpaywall_oa')),
            make_response(200, fixture('unpaywall_closed')),
        )
        response = self.search()
        self.assertEqual(response.status_code, 200)
        serp_calls = self.http.calls_to(SERPAPI)
        self.assertEqual(len(serp_calls), 1)
        self.assertEqual(serp_calls[0].path, '/search')
        self.assertEqual(serp_calls[0].query, {
            'engine': 'google_scholar',
            'q': 'graph neural networks',
            'api_key': 'serp-key-literal',
            'num': 20,
        })
        body = response.json()
        self.assertEqual(body['search_metadata']['status'], 'Success')
        first, second = body['organic_results']
        self.assertEqual(first['doi'], '10.1000/gat.2017.1')
        self.assertEqual(first['unpaywall'], {
            'is_oa': True,
            'oa_status': 'green',
            'oa_url': 'https://arxiv.org/abs/1710.10903',
            'pdf_url': 'https://arxiv.org/pdf/1710.10903.pdf',
            'journal': 'Journal of Graph Learning',
            'year': 2017,
            'publisher': 'Example Press',
        })
        self.assertEqual(second['doi'], '10.1000/gcn.2016.2')
        self.assertEqual(second['unpaywall'], {
            'is_oa': False,
            'oa_status': 'closed',
            'oa_url': None,
            'pdf_url': None,
            'journal': None,
            'year': 2019,
            'publisher': None,
        })

    def test_known_bug_serpapi_request_has_no_timeout(self):
        """Pins today's behavior; phase 5 (paper search) should add a timeout.

        A hung SerpAPI connection would block the request worker indefinitely.
        """
        self.http.queue(SERPAPI, self.empty_serp_page())
        self.search()
        self.assertNotIn('timeout', self.http.calls_to(SERPAPI)[0].kwargs)

    def test_second_search_within_five_seconds_is_rate_limited(self):
        # catches: M25 (window zero), M26 (limit not per user)
        self.http.queue(SERPAPI, self.empty_serp_page())
        self.assertEqual(self.search().status_code, 200)
        self.clock.advance(4.0)
        response = self.search()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json(), {'error': RATE_LIMIT_MESSAGE})
        self.assertEqual(len(self.http.calls_to(SERPAPI)), 1)

    def test_search_is_allowed_again_after_five_seconds(self):
        # catches: a window longer than five seconds
        self.http.queue(SERPAPI, self.empty_serp_page(), self.empty_serp_page())
        self.search()
        self.clock.advance(5.0)
        self.assertEqual(self.search().status_code, 200)
        self.assertEqual(len(self.http.calls_to(SERPAPI)), 2)

    def test_rate_limit_is_per_user(self):
        # catches: M26 (one shared limit for everybody)
        self.http.queue(SERPAPI, self.empty_serp_page(), self.empty_serp_page())
        self.search(token='tok-alice')
        self.assertEqual(self.search(token='tok-bob').status_code, 200)
        self.assertEqual(len(self.http.calls_to(SERPAPI)), 2)

    def test_known_bug_serpapi_auth_error_returned_as_401(self):
        """Pins today's behavior; phase 5 (paper search) should map upstream errors to a different status.

        A bad SerpAPI key comes back as our own 401, which the frontend can mistake for the
        user's session having expired.
        """
        self.http.queue(SERPAPI, make_response(401, {'error': 'Invalid API key.'}))
        response = self.search()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'error': 'Invalid API key.'})

    def test_response_without_organic_results_is_passed_through_unenriched(self):
        # catches: enrichment running on a page with no results
        body = {
            'search_metadata': {'status': 'Success'},
            'search_information': {'organic_results_state': 'Fully empty'},
            'error': "Google hasn't returned any results for this query.",
        }
        self.http.queue(SERPAPI, make_response(200, body))
        response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), body)
        self.assertEqual(self.http.calls_to(CROSSREF), [])
        self.assertEqual(self.http.calls_to(UNPAYWALL), [])

    def test_serpapi_connection_error_returns_500(self):
        # catches: an upstream network failure escaping as an unhandled error
        self.http.queue(SERPAPI, requests.ConnectionError('serpapi unreachable'))
        response = self.search()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {'error': 'serpapi unreachable'})

    def test_known_bug_rate_slot_consumed_on_failure(self):
        """Pins today's behavior; phase 5 (paper search) should only count successful calls.

        The slot is recorded before SerpAPI is called, so a failed search still blocks a retry.
        """
        self.http.queue(SERPAPI, requests.ConnectionError('serpapi unreachable'))
        self.assertEqual(self.search().status_code, 500)
        self.clock.advance(1.0)
        response = self.search()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(len(self.http.calls_to(SERPAPI)), 1)
