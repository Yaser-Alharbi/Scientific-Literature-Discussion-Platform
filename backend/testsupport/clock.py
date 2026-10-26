# backend/testsupport/clock.py
"""Fake clock injected into the modules under test, never into the global time module.

Django's in-memory cache also reads time.time() for expiry, so patching it globally would
corrupt cache behaviour.
"""

from contextlib import contextmanager
from unittest import mock

# Non-zero: search_scholar tests `if last_request_time and ...`, so a clock at 0.0 would
# silently turn the rate limit off.
START = 1_700_000_000.0


class FakeClock:
    def __init__(self, start=START):
        self.now = start
        self.sleeps = []

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def advance(self, seconds):
        self.now += seconds

    @contextmanager
    def installed(self, *modules):
        patches = [mock.patch(f'{name}.time', new=self) for name in modules]
        for p in patches:
            p.start()
        try:
            yield self
        finally:
            for p in reversed(patches):
                p.stop()
