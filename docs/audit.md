# Phase 1 Audit: Repo Hygiene

## Secrets
No real secrets in tracked files or git history (only placeholders in `.env.example`).

Log-hygiene fix: removed prints that logged all webhook request headers (including `Authorization`), part of the webhook token, and a decoded Firebase token (`authentication/views.py`). These were JWTs (Firebase ID tokens expire within an hour; LiveKit webhook tokens are signed but don't contain the secret), so no key rotation is required.

## Credential tests: NOT YET RUN
Needs real keys in `backend/.env` and `frontend/.env.local` (the sandbox used placeholders only).

| Service | Status | Notes |
|---|---|---|
| Firebase (client + Admin SDK) | untested | Email/password + Google login; Django accepts token. `localhost` must be in Firebase authorized domains. Rule out `FIREBASE_SERVICE_ACCOUNT` formatting (`\n` in `private_key`) before calling a key dead. |
| LiveKit | untested | Tests `backend/.env` key/secret/URL + `NEXT_PUBLIC_LIVEKIT_URL`. Webhook cannot reach localhost: stays untested. |
| SerpAPI + Unpaywall | untested | One search; check DOI/PDF enrichment. |

## Baseline (before changes, placeholder env)
- `npm run build`: failed (`/profile` route conflict with the empty `app/profile/page.tsx`).
- `manage.py check`: OK. `makemigrations --check`: no changes. `manage.py test`: not run (Selenium suite).

## After changes
- `rm -rf .next && npm run build && npx tsc --noEmit`: pass; `/auth-test` and `/api/papers/search` no longer routed.
- `manage.py check`, `makemigrations --check`: OK. `pyflakes` and `eslint` unused-var findings: no new ones vs. baseline (livestream/views.py has fewer).
- Manual click-through and room screenshot comparison: NOT DONE (needs real credentials and a browser session).

## Removed
Dead files: `frontend/fiies.txt`, empty `app/profile/page.tsx`, both `livekit-overrides.css`, `auth-test/page.tsx`, `authdebugger.tsx` (+ import), `authGuard.tsx`, `lib/UrlConfig.ts`, `app/api/papers/search/route.ts`, `backend/authentication/firebase.py`, `livestream` `test_endpoint` (+ 2 routes), root `package.json`/`package-lock.json`, `backend/package-lock.json`, `environment.yml`.

Debug output: all `console.log` (frontend); non-failure `print`s in `livestream/views.py` and `authentication/views.py`, plus the logging-only code that fed them (a LiveKit `list_participants` call and two DB counts in `delete_room`, the unused track-event parsing and its two empty webhook branches, unused locals). Failure prints in those two files now use `logger`. Commented-out code removed.
