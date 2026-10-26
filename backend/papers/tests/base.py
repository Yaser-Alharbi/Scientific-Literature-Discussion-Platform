# backend/papers/tests/base.py

import copy
import json
from contextlib import ExitStack
from pathlib import Path

from django.core.cache import cache

from testsupport.clock import FakeClock
from testsupport.fakes import FakeHTTP

FIXTURES = Path(__file__).parent / 'fixtures'

CROSSREF = 'api.crossref.org'
UNPAYWALL = 'api.unpaywall.org'
SERPAPI = 'serpapi.com'


def fixture(name):
    """A fresh copy of a recorded API response body, safe for a test to modify."""
    return copy.deepcopy(json.loads((FIXTURES / f'{name}.json').read_text()))


class FakedNetworkMixin:
    """Fake HTTP and clock for the test, and an empty cache.

    The cache is a per-process locmem cache shared by every test, so it is cleared
    in setUp or one test's lookups would satisfy the next one's.
    """

    def setUp(self):
        super().setUp()
        cache.clear()
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.http = FakeHTTP()
        self.clock = FakeClock()
        stack.enter_context(self.http.installed())
        stack.enter_context(self.clock.installed('papers.services', 'papers.views'))
