# Phase 1 Audit: Repo Hygiene

## Secrets
No real secrets in tracked files or git history (only placeholders in `.env.example`).

Log-hygiene fix: removed prints that logged all webhook request headers (including `Authorization`), part of the webhook token, and a decoded Firebase token (`authentication/views.py`). These were JWTs (Firebase ID tokens expire within an hour; LiveKit webhook tokens are signed but don't contain the secret), so no key rotation is required.

## Credential tests (run locally by the user, results as reported)
| Service | Status | Notes |
|---|---|---|
| Firebase (client + Admin SDK) | pass | Keys work on the user's machine. |
| LiveKit | pass | Keys work. Webhook not testable on localhost: untested. |
| SerpAPI + Unpaywall | pass | Keys work. |

Backend checked locally: `/health/`, room list and admin login all work. The frontend loading hang was fixed on the user's side. Most features were click-tested and work.

## Baseline (before changes, placeholder env)
- `npm run build`: failed (`/profile` route conflict with the empty `app/profile/page.tsx`).
- `manage.py check`: OK. `makemigrations --check`: no changes. `manage.py test`: not run (Selenium suite).

## After changes
- `rm -rf .next && npm run build && npx tsc --noEmit`: pass; `/auth-test` and `/api/papers/search` no longer routed.
- `manage.py check`, `makemigrations --check`: OK. `pyflakes` and `eslint` unused-var findings: no new ones vs. baseline (livestream/views.py has fewer).
- Manual click-through: done by the user on `cleanup`; most features work. No before/after screenshot comparison was taken.

## Removed
Dead files: `frontend/fiies.txt`, empty `app/profile/page.tsx`, both `livekit-overrides.css`, `auth-test/page.tsx`, `authdebugger.tsx` (+ import), `authGuard.tsx`, `lib/UrlConfig.ts`, `app/api/papers/search/route.ts`, `backend/authentication/firebase.py`, `livestream` `test_endpoint` (+ 2 routes), root `package.json`/`package-lock.json`, `backend/package-lock.json`, `environment.yml`.

Debug output: all `console.log` (frontend); non-failure `print`s in `livestream/views.py` and `authentication/views.py`, plus the logging-only code that fed them (a LiveKit `list_participants` call and two DB counts in `delete_room`, the unused track-event parsing and its two empty webhook branches, unused locals). Failure prints in those two files now use `logger`. Commented-out code removed.
