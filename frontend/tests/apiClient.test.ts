import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, createApiClient } from '../src/lib/apiClient.ts';

interface Call {
  url: string;
  init: RequestInit;
}

function setup(responses: Array<Response | Error>, token: string | null = 'abc') {
  const calls: Call[] = [];
  let tokenCalls = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next as Response;
  }) as unknown as typeof fetch;
  const client = createApiClient({
    baseUrl: 'http://localhost:8000',
    getToken: async () => {
      tokenCalls += 1;
      return token;
    },
    fetchImpl,
  });
  return { client, calls, tokenCalls: () => tokenCalls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function header(call: Call, name: string) {
  return new Headers(call.init.headers).get(name);
}

test('base URL and path are joined with exactly one slash and the query string is kept', async () => {
  const { client, calls } = setup([json({}), json({})]);
  await client.request('/api/user-profile?x=1');
  await client.request('api/user-profile');
  assert.equal(calls[0].url, 'http://localhost:8000/api/user-profile?x=1');
  assert.equal(calls[1].url, 'http://localhost:8000/api/user-profile');
});

test('the bearer token comes from the getter on every request', async () => {
  // catches: the Authorization header dropped, or a token cached between requests
  const { client, calls, tokenCalls } = setup([json({}), json({})]);
  await client.request('/api/a');
  await client.request('/api/b');
  assert.equal(header(calls[0], 'Authorization'), 'Bearer abc');
  assert.equal(header(calls[1], 'Authorization'), 'Bearer abc');
  assert.equal(tokenCalls(), 2);
});

test('no Authorization header when the getter has no token', async () => {
  const { client, calls } = setup([json({})], null);
  await client.request('/api/a');
  assert.equal(header(calls[0], 'Authorization'), null);
});

test('auth: false does not ask for a token at all', async () => {
  const { client, calls, tokenCalls } = setup([json([])]);
  await client.request('/api/research-interests', { auth: false });
  assert.equal(header(calls[0], 'Authorization'), null);
  assert.equal(tokenCalls(), 0);
});

test('a body is sent as JSON with a JSON content type; a GET sends neither', async () => {
  const { client, calls } = setup([json({}), json({})]);
  await client.request('/api/set-password', { method: 'POST', body: { password: 'p', n: 1 } });
  await client.request('/api/user-profile');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(header(calls[0], 'Content-Type'), 'application/json');
  assert.equal(calls[0].init.body, '{"password":"p","n":1}');
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(header(calls[1], 'Content-Type'), null);
  assert.equal(calls[1].init.body, undefined);
});

test('a successful response resolves to its parsed JSON; an empty body to undefined', async () => {
  const { client } = setup([json({ ok: true }), new Response(null, { status: 204 })]);
  assert.deepEqual(await client.request('/api/a'), { ok: true });
  assert.equal(await client.request('/api/b'), undefined);
});

test('an error body with "error" becomes an ApiError with that message and status', async () => {
  // catches: non-OK responses resolved as if they had succeeded
  const { client } = setup([json({ error: 'bad' }, 400)]);
  await assert.rejects(client.request('/api/a'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 400);
    assert.equal(e.message, 'bad');
    return true;
  });
});

test('"error" is preferred over "detail", and "detail" is used when it is all there is', async () => {
  const { client } = setup([json({ error: 'e', detail: 'd' }, 400), json({ detail: 'nope' }, 401)]);
  await assert.rejects(client.request('/api/a'), { message: 'e' });
  await assert.rejects(client.request('/api/a'), { message: 'nope' });
});

test('an HTML error page becomes a generic ApiError, not a SyntaxError', async () => {
  const { client } = setup([new Response('<html>Server Error</html>', { status: 500 })]);
  await assert.rejects(client.request('/api/a'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 500);
    assert.equal(e.message, 'Request failed (HTTP 500)');
    return true;
  });
});

test('a network failure becomes an ApiError with status 0', async () => {
  const { client } = setup([new TypeError('fetch failed')]);
  await assert.rejects(client.request('/api/a'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 0);
    assert.equal(e.message, 'Cannot reach the server');
    return true;
  });
});

test('a rejected token is not retried', async () => {
  // catches: re-sending the same rejected token (the old fetchProfile loop)
  const { client, calls, tokenCalls } = setup([json({ error: 'Invalid or expired Firebase token' }, 401), json({})]);
  await assert.rejects(client.request('/api/user-profile'), { status: 401 });
  assert.equal(calls.length, 1);
  assert.equal(tokenCalls(), 1);
});

test('an error from the token getter is passed on unchanged', async () => {
  const client = createApiClient({
    baseUrl: 'http://localhost:8000',
    getToken: async () => {
      throw new Error('token expired locally');
    },
    fetchImpl: (async () => json({})) as unknown as typeof fetch,
  });
  await assert.rejects(client.request('/api/a'), { message: 'token expired locally' });
});
