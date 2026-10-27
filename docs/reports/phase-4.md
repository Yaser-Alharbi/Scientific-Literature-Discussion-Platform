# Phase 4 report: Core foundations

Branch `phase-4-foundations`. Analysis and decisions: `docs/core/foundations.md`. Status: ready for your review and click-through; tick `[x]` in the PR.

## What changed and why
**Backend** (`backend/authentication`, `django_backend`)
- One auth helper (`bearer_token`, `verify_firebase_token`) replaces six copies of header parsing. Views use `request.user`. Invalid, expired and unregistered tokens get distinct 401 messages; tokens are verified with 60 s clock skew.
- On public (`AllowAny`) views a bad token is treated as anonymous again, as before; phase 7 restores strict 401s first (ROADMAP phase 7, first bullet).
- Global `{"error": ...}` exception handler; serializers for profile output, profile update and register; `update_profile` validates, trims interest names and runs in one transaction; `register` answers 401/400 instead of 500 and uses `get_or_create`.
- `sync_reset_password` now requires authentication and changes the caller's own password (was open to anyone, by email).
- One public `GET /api/research-interests`; the livestream copy and its routes are removed. `verify-token` and `check-user` removed. `TokenAuthentication` (not installed, crashed on `Authorization: Token`) removed.
- Logging: prints in `authentication`, `settings.py` and `papers/services.py` now use `logging`.
- Migrations: decision only, nothing edited (0007/0008 net to the model state; `livestream` 0004 never existed).

**Frontend** (`frontend/src`)
- `lib/config.ts` (`readConfig`, fails fast naming the missing variable) and `lib/apiClient.ts` (fresh token per request, never retries a rejected one, `ApiError` for every failure shape); `lib/api.ts` has the typed auth endpoints; `types/user.ts` has the shared type.
- `authStore`: no `any`/`@ts-ignore`, dead code removed, requests go through the client, profile updates use the backend response, "Token used too early" workarounds deleted, the new Firebase account is deleted if backend signup fails.
- Research interests (profile page and rooms page) use the public endpoint; `LoginForm` no longer shows "User not found" after a successful login; the reset page syncs through the client.

## Checks run (final tree)
| Check | Result |
|---|---|
| `python manage.py test` | 160 tests OK (12 Selenium skipped); `--shuffle 11` OK |
| `python manage.py makemigrations --check --dry-run` | No changes detected |
| `python scripts/mutation_check.py` | 83/83 killed (30 phase 3, 53 phase 4), 0 survived/stale/invalid |
| `npm run lint` | matches the baseline; baseline lowered 102 -> 74 findings (authStore, ResetPassword, ForgotPassword, LoginForm, PasswordSettings `any`, unused vars) |
| `npm run typecheck` | clean |
| `npm run test` | 18 tests pass (`config.ts`, `apiClient.ts`; watched failing against stubs first) |
| `npm run build` | passes with the placeholder `NEXT_PUBLIC_*` variables |

Frontend hand mutants (the Python runner cannot apply them), each applied, run and reverted: 13/13 killed (trailing slash, missing/empty variable, optional LiveKit URL, `Authorization` dropped, token requested when `auth:false`, non-OK swallowed, `detail` before `error`, HTML body throws, network status, retry once, slash join, content type always).

## Deliberate changes to existing tests and patches
- Removed `SyncResetPasswordTests.test_unknown_email_is_404` (the body email is no longer used).
- Flipped the public-view test to the lenient behavior (its commit says so).
- Phase 3 patches M14, M16, M17, M18, M21, M24 re-created (same names, same bugs) after the logger change; three phase 4 profile patches replaced by serializer mutants; M25 reverses the sort because dropping `order_by` is equivalent on SQLite.
- No `test_known_bug_*` test of phases 5 or 7 changed.

## Not done on purpose
- `syncAuthState` still sets `isAuthenticated` before the profile loads (needs a click-through; parking lot, phase 8).
- Paper, extract and room `fetch` calls and the persisted `token` stay until phases 5-7 (parking lot).
- Firebase not initialised remains an invalid-token 401 logged at WARNING (accepted).
- I could not click-test or exercise real Firebase here; the checks below are yours.

## Your click-through and Firebase checks
Setup: `backend/.env` (`SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`), `frontend/.env.local` (all `NEXT_PUBLIC_*` incl. `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`), fresh DB (`rm backend/db.sqlite3; python manage.py migrate`), `python manage.py runserver 8000`, `npm run dev`. Firebase console: email/password and Google enabled, `localhost` authorized. Check a stored user with `python manage.py shell -c "from authentication.models import User; u=User.objects.get(email='X'); print(u.firebase_uid,u.auth_methods,u.password_set,u.check_password('PW'))"`.
1. **Email signup** `/Signup`: lands on `/profile`; shell shows `EMAIL`, `password_set=True`, `check_password` True.
2. **Logout, email login**: wrong password -> "Incorrect account information"; correct -> home, and no "User not found" message at any point.
3. **Google signup** with a never-used account: `/profile?provider=google&newUser=true`; shell `GOOGLE`, `password_set=False`, names from Google.
4. **Google login** with it: signed in. With a Google account not registered here: the backend's "not registered" message, and you are signed out of Firebase.
5. **Profile**: change names, institution, bio; add two interests; reload and check they persist. The interest dropdown now lists existing interests (it was always empty before). Saving makes one request, not two.
6. **Rooms page** still shows interest suggestions when creating a room (now served by `/api/research-interests`).
7. **Set password for a Google user**: reauth popup, set one; log out; email login works; shell `auth_methods='GOOGLEEMAIL'`, `password_set=True`. Then change it as an email user.
8. **Forgot/reset**: set the Firebase console reset-email action URL to `http://localhost:3000/ResetPassword`, request and click the link, set a password, log in with it; shell `check_password(new)` True.
9. **Sync-reset hole closed**: `curl -i -X POST localhost:8000/api/sync-reset-password -H 'Content-Type: application/json' -d '{"email":"<registered email>","password":"x-hack-1"}'` -> 401, password unchanged.
10. **Orphan cleanup**: stop the backend, try email signup (expect an error), start the backend, sign up again with the same email: must succeed; the Firebase console shows one user.
11. **Stale session**: sign in, leave the tab alone for over an hour (or clear `auth-storage` token in localStorage), reload `/profile`: the profile loads instead of a forced logout.
12. **Postgres** (needs a local PostgreSQL 16): empty DB with the `DATABASE_*` variables, `python manage.py migrate` completes (covers 0007 -> 0008).
13. **Clock skew** (optional): machine clock 30 s behind, log in: no "Token used too early".

## Decisions still open
None blocking. Parking-lot entries are in `docs/ROADMAP.md`; the CLAUDE.md Definition of done should gain `npm run test` (you apply it).
