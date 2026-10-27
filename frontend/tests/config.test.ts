import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readConfig } from '../src/lib/config.ts';

const ENV = {
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'key-1',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'app-1',
  NEXT_PUBLIC_LIVEKIT_URL: 'wss://demo.livekit.cloud',
};

test('trailing slashes are trimmed from the API base URL', () => {
  // catches: URLs built as "http://host//api/..."
  assert.equal(readConfig({ ...ENV, NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000//' }).apiBaseUrl, 'http://localhost:8000');
});

test('Firebase settings are returned unchanged', () => {
  assert.deepEqual(readConfig(ENV).firebase, {
    apiKey: 'key-1',
    authDomain: 'demo.firebaseapp.com',
    projectId: 'demo',
    storageBucket: 'demo.appspot.com',
    messagingSenderId: '123',
    appId: 'app-1',
  });
});

test('a missing API base URL throws an error naming the variable', () => {
  // catches: the silent "undefined/api/..." URLs
  const { NEXT_PUBLIC_API_BASE_URL, ...rest } = ENV;
  assert.throws(() => readConfig(rest), /NEXT_PUBLIC_API_BASE_URL/);
});

test('a missing Firebase variable throws an error naming it', () => {
  const { NEXT_PUBLIC_FIREBASE_APP_ID, ...rest } = ENV;
  assert.throws(() => readConfig(rest), /NEXT_PUBLIC_FIREBASE_APP_ID/);
});

test('an empty variable counts as missing', () => {
  assert.throws(() => readConfig({ ...ENV, NEXT_PUBLIC_FIREBASE_API_KEY: '' }), /NEXT_PUBLIC_FIREBASE_API_KEY/);
});

test('the LiveKit URL is optional and defaults to an empty string', () => {
  const { NEXT_PUBLIC_LIVEKIT_URL, ...rest } = ENV;
  assert.equal(readConfig(rest).livekitUrl, '');
  assert.equal(readConfig(ENV).livekitUrl, 'wss://demo.livekit.cloud');
});
