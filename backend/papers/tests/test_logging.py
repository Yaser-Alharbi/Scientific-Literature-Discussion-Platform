# backend/papers/tests/test_logging.py
"""The enrichment helpers report problems through `logging`, never through print."""

import contextlib
import io

import requests
from django.test import SimpleTestCase, override_settings

from papers.services import enrich_results_with_doi, enrich_results_with_unpaywall, fetch_with_retry
from papers.tests.base import CROSSREF, UNPAYWALL, FakedNetworkMixin
from testsupport.fakes import make_response

URL = 'https://api.crossref.org/works?query.title=x'


@override_settings(CROSSREF_EMAIL='crossref@example.test', UNPAYWALL_EMAIL='unpaywall@example.test')
class EnrichmentLoggingTests(FakedNetworkMixin, SimpleTestCase):
    def run_quietly(self, level, func, *args):
        """Runs func, returning (log records, printed text); fails if nothing is logged at `level`."""
        out = io.StringIO()
        with self.assertLogs('papers.services', level) as logs, contextlib.redirect_stdout(out):
            func(*args)
        return logs.records, out.getvalue()

    def test_retried_429_is_a_warning_naming_the_status_and_url(self):
        # catches: print() instead of the logger
        self.http.queue(CROSSREF, make_response(429, {}), make_response(200, {}))
        records, printed = self.run_quietly('WARNING', fetch_with_retry, URL)
        self.assertEqual([r.levelname for r in records], ['WARNING'])
        self.assertIn('429', records[0].getMessage())
        self.assertIn(URL, records[0].getMessage())
        self.assertEqual(printed, '')

    def test_connection_errors_are_one_warning_per_attempt(self):
        self.http.queue(CROSSREF, requests.ConnectionError('down'), requests.Timeout('slow'))
        records, printed = self.run_quietly('WARNING', fetch_with_retry, URL)
        self.assertEqual([r.levelname for r in records], ['WARNING', 'WARNING'])
        self.assertIn('down', records[0].getMessage())
        self.assertEqual(printed, '')

    def test_unreadable_crossref_body_is_logged_as_an_error(self):
        self.http.queue(CROSSREF, make_response(200, raw=b'<html>not json</html>'))
        records, printed = self.run_quietly('ERROR', enrich_results_with_doi, [{'title': 'A paper'}])
        self.assertEqual([r.levelname for r in records], ['ERROR'])
        self.assertIn('DOI', records[0].getMessage())
        self.assertEqual(printed, '')

    def test_unreadable_unpaywall_body_is_logged_as_an_error(self):
        self.http.queue(UNPAYWALL, make_response(200, raw=b'<html>not json</html>'))
        records, printed = self.run_quietly('ERROR', enrich_results_with_unpaywall,
                                            [{'title': 'A paper', 'doi': '10.1000/x'}])
        self.assertEqual([r.levelname for r in records], ['ERROR'])
        self.assertIn('Unpaywall', records[0].getMessage())
        self.assertEqual(printed, '')
