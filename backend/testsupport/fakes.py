# backend/testsupport/fakes.py
"""Fakes for the external boundaries: HTTP (SerpAPI, CrossRef, Unpaywall) and LiveKit."""

import json
from collections import namedtuple
from contextlib import contextmanager
from unittest import mock
from urllib.parse import parse_qsl, urlsplit

import requests
from livekit.protocol.models import ParticipantInfo
from livekit.protocol.room import DeleteRoomResponse, ListParticipantsResponse

Call = namedtuple('Call', 'host path query kwargs')


def make_response(status, json_body=None, raw=None):
    """A real requests.Response, so .json() really parses and really raises on a bad body."""
    response = requests.Response()
    response.status_code = status
    response._content = raw if raw is not None else json.dumps(json_body).encode('utf-8')
    response.headers['Content-Type'] = 'application/json'
    return response


class FakeHTTP:
    """Replaces requests.get for the whole test, routing by host to queued responses.

    papers.services and papers.views share one `requests` module, so this patches
    requests.get exactly once. A queued exception instance is raised instead of returned.
    """

    def __init__(self):
        self.queues = {}
        self.calls = []

    def queue(self, host, *items):
        self.queues.setdefault(host, []).extend(items)

    def calls_to(self, host):
        return [call for call in self.calls if call.host == host]

    def _get(self, url, params=None, **kwargs):
        parts = urlsplit(url)
        host = parts.hostname
        query = dict(parse_qsl(parts.query))
        query.update(params or {})
        self.calls.append(Call(host, parts.path, query, kwargs))
        queue = self.queues.get(host)
        if not queue:
            raise AssertionError(f"FakeHTTP has no queued response for {host}{parts.path}")
        item = queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item

    @contextmanager
    def installed(self):
        with mock.patch('requests.get', new=self._get):
            yield self


class FakeRoomService:
    def __init__(self, owner):
        self._owner = owner

    async def list_participants(self, request):
        self._owner.list_requests.append(request)
        if self._owner.list_error:
            raise self._owner.list_error
        return ListParticipantsResponse(
            participants=[ParticipantInfo(identity=f'p{i}') for i in range(self._owner.remaining)]
        )

    async def delete_room(self, request):
        self._owner.delete_requests.append(request)
        if self._owner.delete_error:
            raise self._owner.delete_error
        return DeleteRoomResponse()


class FakeLiveKit:
    """Async-context-manager stand-in for livekit.api.LiveKitAPI with only the room calls we use.

    `remaining` is how many participants LiveKit reports. It is a plain number because
    the handlers run it inside an event loop, where ORM access is not allowed.
    """

    def __init__(self, remaining=0, list_error=None, delete_error=None):
        self.remaining = remaining
        self.list_error = list_error
        self.delete_error = delete_error
        self.list_requests = []
        self.delete_requests = []
        self.room = FakeRoomService(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @contextmanager
    def installed(self):
        with mock.patch('livestream.webhook_events.get_livekit_client', new=lambda: self):
            yield self
