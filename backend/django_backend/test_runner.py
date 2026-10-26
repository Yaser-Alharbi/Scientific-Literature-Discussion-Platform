# backend/django_backend/test_runner.py

import ipaddress
import os
import socket

from django.test.runner import DiscoverRunner


class NetworkAccessBlocked(BaseException):
    """Raised on any non-loopback network use during tests.

    A BaseException on purpose: production code wraps its third-party calls in
    `except Exception` (enrichment loops, search_scholar, FirebaseAuthentication),
    which would swallow a normal exception and let a test pass with a stray real call.
    """


def _is_loopback(host):
    if isinstance(host, bytes):
        host = host.decode()
    if host == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _check_address(address):
    # AF_UNIX addresses are paths, not (host, port) tuples
    if isinstance(address, tuple) and not _is_loopback(address[0]):
        raise NetworkAccessBlocked(f"network access blocked in tests: {address[0]!r}")


PROXY_VARS = ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')


class NetworkBlockingRunner(DiscoverRunner):
    """Blocks every non-loopback connection while the test suite runs.

    DNS resolution is blocked as well as connect: offline, a stray lookup would
    otherwise surface as requests.ConnectionError, which fetch_with_retry
    treats as transient and turns into a silent None. Proxy variables are removed
    too: a loopback proxy would let requests reach the internet through an allowed address.
    """

    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        self._proxies = {name: os.environ.pop(name) for name in PROXY_VARS if name in os.environ}
        self._originals = (socket.getaddrinfo, socket.socket.connect, socket.create_connection)
        original_getaddrinfo, original_connect, original_create_connection = self._originals

        def getaddrinfo(host, *args, **kw):
            _check_address((host,))
            return original_getaddrinfo(host, *args, **kw)

        def connect(sock, address):
            _check_address(address)
            return original_connect(sock, address)

        def create_connection(address, *args, **kw):
            _check_address(address)
            return original_create_connection(address, *args, **kw)

        socket.getaddrinfo = getaddrinfo
        socket.socket.connect = connect
        socket.create_connection = create_connection

    def teardown_test_environment(self, **kwargs):
        socket.getaddrinfo, socket.socket.connect, socket.create_connection = self._originals
        os.environ.update(self._proxies)
        super().teardown_test_environment(**kwargs)
