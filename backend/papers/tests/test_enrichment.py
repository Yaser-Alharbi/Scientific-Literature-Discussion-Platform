# backend/papers/tests/test_enrichment.py
"""Characterization tests for fetch_with_retry and the CrossRef / Unpaywall enrichment."""

import requests
from django.test import SimpleTestCase, override_settings

from papers.services import (
    enrich_results_with_doi,
    enrich_results_with_unpaywall,
    fetch_with_retry,
)
from papers.tests.base import CROSSREF, UNPAYWALL, FakedNetworkMixin, fixture
from testsupport.fakes import make_response

TITLE = 'Graph attention networks'
GAT_DOI = '10.1000/gat.2017.1'
URL = 'https://api.crossref.org/works?query.title=x'


class FetchWithRetryTests(FakedNetworkMixin, SimpleTestCase):
    def test_success_makes_one_request_with_a_timeout_and_no_sleep(self):
        # catches: a request without the 5s timeout, or a needless sleep on success
        self.http.queue(CROSSREF, make_response(200, {}))
        response = fetch_with_retry(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(self.http.calls[0].kwargs, {'timeout': 5})
        self.assertEqual(self.clock.sleeps, [])

    def test_429_is_retried_once_after_a_one_second_pause(self):
        # catches: M14 (429 final), M15 (single attempt), M17 (no pause)
        self.http.queue(CROSSREF, make_response(429, {}), make_response(200, {}))
        response = fetch_with_retry(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.http.calls), 2)
        self.assertEqual(self.clock.sleeps, [1.0])

    def test_two_server_errors_give_none(self):
        # catches: M16 (500 treated as an answer)
        self.http.queue(CROSSREF, make_response(500, {}), make_response(500, {}))
        self.assertIsNone(fetch_with_retry(URL))
        self.assertEqual(len(self.http.calls), 2)

    def test_timeout_then_connection_error_gives_none(self):
        # catches: request exceptions escaping instead of being retried and reported as None
        self.http.queue(CROSSREF, requests.Timeout('slow'), requests.ConnectionError('down'))
        self.assertIsNone(fetch_with_retry(URL))
        self.assertEqual(len(self.http.calls), 2)

    def test_404_is_returned_without_retry(self):
        # catches: a 4xx being retried
        self.http.queue(CROSSREF, make_response(404, {}))
        response = fetch_with_retry(URL)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(self.http.calls), 1)


@override_settings(CROSSREF_EMAIL='crossref@example.test', UNPAYWALL_EMAIL='unpaywall@example.test')
class DoiEnrichmentTests(FakedNetworkMixin, SimpleTestCase):
    def crossref_body(self, doi):
        body = fixture('crossref_works')
        body['message']['items'][0]['DOI'] = doi
        return body

    def test_match_sets_doi_and_asks_crossref_for_one_row_with_contact_email(self):
        # catches: M20 (mailto dropped), a changed query parameter or row count
        self.http.queue(CROSSREF, make_response(200, fixture('crossref_works')))
        results = [{'title': TITLE}]
        enrich_results_with_doi(results)
        self.assertEqual(results[0]['doi'], GAT_DOI)
        call = self.http.calls[0]
        self.assertEqual(call.host, 'api.crossref.org')
        self.assertEqual(call.path, '/works')
        self.assertEqual(
            call.query,
            {'query.title': TITLE, 'rows': '1', 'mailto': 'crossref@example.test'},
        )

    def test_repeat_lookup_is_served_from_cache(self):
        # catches: the success path not caching the doi
        self.http.queue(CROSSREF, make_response(200, fixture('crossref_works')))
        enrich_results_with_doi([{'title': TITLE}])
        results = [{'title': TITLE}]
        enrich_results_with_doi(results)
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(results[0]['doi'], GAT_DOI)

    def test_no_match_sets_no_doi_and_the_miss_is_cached(self):
        # catches: M18 (miss not cached, so every search re-asks CrossRef)
        self.http.queue(CROSSREF, make_response(200, fixture('crossref_empty')))
        results = [{'title': TITLE}]
        enrich_results_with_doi(results)
        enrich_results_with_doi(results)
        self.assertNotIn('doi', results[0])
        self.assertEqual(len(self.http.calls), 1)

    def test_transient_failure_is_not_cached(self):
        # catches: M19 (a transient failure remembered as "no such paper")
        self.http.queue(
            CROSSREF,
            make_response(500, {}), make_response(500, {}),
            make_response(200, fixture('crossref_works')),
        )
        results = [{'title': TITLE}]
        enrich_results_with_doi(results)
        self.assertNotIn('doi', results[0])
        enrich_results_with_doi(results)
        self.assertEqual(results[0]['doi'], GAT_DOI)
        self.assertEqual(len(self.http.calls), 3)

    def test_client_error_sets_no_doi_and_is_not_cached(self):
        # catches: a 4xx answer being cached as a miss
        self.http.queue(CROSSREF, make_response(400, {}), make_response(400, {}))
        results = [{'title': TITLE}]
        enrich_results_with_doi(results)
        enrich_results_with_doi(results)
        self.assertNotIn('doi', results[0])
        self.assertEqual(len(self.http.calls), 2)

    def test_malformed_body_does_not_stop_the_other_results(self):
        # catches: M21 (loop aborted by one bad response)
        self.http.queue(
            CROSSREF,
            make_response(200, raw=b'<html>not json</html>'),
            make_response(200, fixture('crossref_works')),
        )
        results = [{'title': 'First paper'}, {'title': 'Second paper'}]
        enrich_results_with_doi(results)
        self.assertNotIn('doi', results[0])
        self.assertEqual(results[1]['doi'], GAT_DOI)

    def test_each_distinct_title_is_looked_up(self):
        # catches: results sharing one lookup or one cache entry
        self.http.queue(
            CROSSREF,
            make_response(200, self.crossref_body('10.1/aaa')),
            make_response(200, self.crossref_body('10.1/bbb')),
        )
        results = [{'title': 'Paper A'}, {'title': 'Paper B'}]
        enrich_results_with_doi(results)
        self.assertEqual([r['doi'] for r in results], ['10.1/aaa', '10.1/bbb'])
        self.assertEqual([c.query['query.title'] for c in self.http.calls], ['Paper A', 'Paper B'])


@override_settings(CROSSREF_EMAIL='crossref@example.test', UNPAYWALL_EMAIL='unpaywall@example.test')
class UnpaywallEnrichmentTests(FakedNetworkMixin, SimpleTestCase):
    def test_result_without_doi_makes_no_request(self):
        # catches: Unpaywall being called with a missing doi
        results = [{'title': TITLE}]
        enrich_results_with_unpaywall(results)
        self.assertEqual(self.http.calls, [])
        self.assertNotIn('unpaywall', results[0])

    def test_open_access_record_is_mapped_to_seven_fields(self):
        # catches: M22 (oa_url / pdf_url swapped), a field renamed or dropped
        self.http.queue(UNPAYWALL, make_response(200, fixture('unpaywall_oa')))
        results = [{'title': TITLE, 'doi': GAT_DOI}]
        enrich_results_with_unpaywall(results)
        self.assertEqual(results[0]['unpaywall'], {
            'is_oa': True,
            'oa_status': 'green',
            'oa_url': 'https://arxiv.org/abs/1710.10903',
            'pdf_url': 'https://arxiv.org/pdf/1710.10903.pdf',
            'journal': 'Journal of Graph Learning',
            'year': 2017,
            'publisher': 'Example Press',
        })

    def test_closed_record_has_no_links(self):
        # catches: links invented when best_oa_location is null
        self.http.queue(UNPAYWALL, make_response(200, fixture('unpaywall_closed')))
        results = [{'title': 'A closed paper', 'doi': '10.1000/closed.1'}]
        enrich_results_with_unpaywall(results)
        self.assertEqual(results[0]['unpaywall'], {
            'is_oa': False,
            'oa_status': 'closed',
            'oa_url': None,
            'pdf_url': None,
            'journal': None,
            'year': 2019,
            'publisher': None,
        })

    def test_missing_is_oa_defaults_to_false(self):
        # catches: M23 (default changed to None)
        body = fixture('unpaywall_closed')
        del body['is_oa']
        self.http.queue(UNPAYWALL, make_response(200, body))
        results = [{'title': 'A closed paper', 'doi': '10.1000/closed.1'}]
        enrich_results_with_unpaywall(results)
        self.assertIs(results[0]['unpaywall']['is_oa'], False)

    def test_repeat_lookup_is_served_from_cache(self):
        # catches: the success path not caching the record
        self.http.queue(UNPAYWALL, make_response(200, fixture('unpaywall_oa')))
        enrich_results_with_unpaywall([{'title': TITLE, 'doi': GAT_DOI}])
        results = [{'title': TITLE, 'doi': GAT_DOI}]
        enrich_results_with_unpaywall(results)
        self.assertEqual(len(self.http.calls), 1)
        self.assertEqual(results[0]['unpaywall']['oa_status'], 'green')

    def test_unknown_doi_adds_nothing_and_the_miss_is_cached(self):
        # catches: M24 (404 not cached)
        self.http.queue(UNPAYWALL, make_response(404, {'error': True, 'message': "isn't in Unpaywall"}))
        results = [{'title': TITLE, 'doi': GAT_DOI}]
        enrich_results_with_unpaywall(results)
        enrich_results_with_unpaywall(results)
        self.assertNotIn('unpaywall', results[0])
        self.assertEqual(len(self.http.calls), 1)

    def test_transient_failure_is_not_cached(self):
        # catches: a transient failure remembered as "no record"
        self.http.queue(
            UNPAYWALL,
            make_response(500, {}), make_response(500, {}),
            make_response(200, fixture('unpaywall_oa')),
        )
        results = [{'title': TITLE, 'doi': GAT_DOI}]
        enrich_results_with_unpaywall(results)
        self.assertNotIn('unpaywall', results[0])
        enrich_results_with_unpaywall(results)
        self.assertEqual(results[0]['unpaywall']['oa_status'], 'green')
        self.assertEqual(len(self.http.calls), 3)

    def test_request_carries_the_doi_in_the_path_and_the_contact_email(self):
        # catches: a wrong URL shape or a missing email
        self.http.queue(UNPAYWALL, make_response(200, fixture('unpaywall_oa')))
        enrich_results_with_unpaywall([{'title': TITLE, 'doi': GAT_DOI}])
        call = self.http.calls[0]
        self.assertEqual(call.host, 'api.unpaywall.org')
        self.assertEqual(call.path, '/v2/10.1000/gat.2017.1')
        self.assertEqual(call.query, {'email': 'unpaywall@example.test'})
