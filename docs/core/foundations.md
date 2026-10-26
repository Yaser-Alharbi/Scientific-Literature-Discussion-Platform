# Phase 4 analysis: foundations (shared infrastructure, auth, profile)

Step 1 of the "Core rebuild" method. Analysis only: no code, tests or patches have been changed. The decisions in section 8 are approved; nothing below is implemented yet. Line numbers are for `phase-4-foundations` at `cleanup` HEAD.

Legend: **fix** = keep the design, correct the code. **redesign** = change the design, needs explicit approval, built on the existing implementation.

How the claims were checked: I read the code end to end and ran a throwaway probe (outside the repo, `fake_firebase` + DRF `APIClient` on SQLite) against the unchanged backend. Probe results are quoted as "probe".

## 1. Summary

| ID | Area | Verdict | One line |
|----|------|---------|----------|
| B1 | Backend auth helper | fix | Six copies of header parsing and `verify_id_token` in views; five of them are dead code behind `FirebaseAuthentication`, which itself swallows its own errors |
| B2 | Dead and duplicate endpoints | fix (delete approved) | `verify_token` and `check_user` are unused; `check_user` is routed twice |
| B3 | Serializers | fix | Two hand-built profile dicts that already differ; no input validation |
| B4 | Error convention | fix, plus one optional redesign (global handler) | Three body shapes; unexpected errors return 500 with `str(e)` |
| B5 | `register` | fix | Missing or bad token and token without email return 500 |
| B6 | `set_password` | fix | Dead header parse, double save |
| B7 | `sync_reset_password` | fix (security) | `AllowAny` plus email from the body: anyone can overwrite any user's Django password |
| B8 | `update_profile` | fix | No validation, not atomic, silent ignore of bad input |
| B9 | Research interests | fix | Two views; the one the profile page calls always returns 401, so the suggestion list is always empty |
| B10 | Logging | fix | 6 `print` calls; no logger in `papers/services.py` |
| B11 | Migrations | leave as is (decision) | 0007/0008 net to the model state; livestream 0004 never existed |
| F1 | Frontend config | fix | `NEXT_PUBLIC_API_BASE_URL` read in 11 places (6 files); unset becomes the string `"undefined/api/..."` |
| F2 | Frontend API client | fix | 7 raw `fetch` calls in auth code; `response.json()` on error bodies throws on HTML 500s |
| F3 | `authStore` | fix | Retries a rejected stored token, 15 `any`, 3 `@ts-ignore`, dead constants, timers at import |
| F4 | Shared types, `no-explicit-any` | fix | `User` type lives in the store; 22 of the 52 `any` are in phase 4 files |
| F5 | Auth and profile flows | fix | Success path of login shows an error message; orphan Firebase user on failed signup |
| E1 | Global `{"error": ...}` exception handler | redesign, **approved** | See B4 |
| P1 | Stop mirroring passwords into Django | redesign, **declined** | See B7; kept in `docs/future-todos.md` |

Everything else is a fix. E1 is the only approved redesign; P1 is declined.

## 2. What works

- Firebase ID token verification in DRF works end to end (verified by the user in phase 1; `docs/audit.md`).
- Happy paths of signup (email and Google), login, profile read and update, set password and reset password were click-tested by the user in phase 1.
- Model and data: `User.firebase_uid` is unique, `ResearchInterest.name` is unique, interests are shared by users and rooms.
- `FirebaseAuthentication` is the DRF default (`settings.py:244-257`), so every other app's views already get `request.user` without parsing headers. The helper work below makes auth views follow the same pattern.
- The test harness from phase 3 already has `fake_firebase` (`testsupport/auth.py`), the network guard and the mutation runner.

## 3. Backend

### B1. One auth helper, remove dead token blocks: fix
**What is wrong**
- Header parsing plus `auth.verify_id_token` is repeated in `authentication/views.py` at `:17-24` (`verify_token`), `:49-50` (`register`), `:105-115` (`user_profile`), `:150-157` (`check_user`), `:177-178` (`set_password`), `:200-205` (`update_profile`), and again in `authentication/authentication.py:14-26`.
- Only `register` and `sync_reset_password` are `AllowAny`. The other views run behind `IsAuthenticated` plus `FirebaseAuthentication` (`settings.py:244-257`), so by the time the view body runs, `request.user` is the Django user. Their own token blocks and the `User.DoesNotExist` branches (`:135-137`, `:164-165`, `:192-193`, `:244-245`) can never execute. Probe: an unregistered uid calling `/api/user-profile`, `/api/check-user`, `/verify-token`, `/api/update-profile` gets `401 {"detail": "Authentication credentials were not provided."}`, never the 404 the views promise.
- `authentication.py:37-39` has a blanket `except Exception`: it swallows the `AuthenticationFailed` it raised itself at `:33`, `print`s (`:38`), and returns `None`, so DRF falls through to Session and Token auth and answers with the misleading "credentials were not provided". Expired token, forged token, unregistered user and Firebase not initialised are indistinguishable.
- `authentication.py:20` parses with `split('Bearer ')[1]`; every view repeats that.

**Reason for fix**: the design (Firebase token verified in DRF) is right. It only needs one implementation.

**Change**
- `verify_firebase_token(request)` in `authentication/authentication.py`: reads the `Bearer` header, verifies, returns the decoded claims, raises `AuthenticationFailed` for a missing or invalid token. `FirebaseAuthentication.authenticate` and `register` (the only view that needs claims before a user exists) both use it.
- Catch only `ValueError` and `auth.InvalidIdTokenError` (parent of the expired and revoked errors; checked in the installed firebase_admin 6.7). `CertificateFetchError` or "Firebase not initialised" are server problems: log and let them surface as 5xx, not 401.
- Unregistered uid: `AuthenticationFailed("User is authenticated with Firebase but not registered")`.
- `authenticate_header` stays, so these stay 401 and not 403.
- Views use `request.user`; the dead blocks and unreachable branches go.

**Pin with characterization tests first** (new file `authentication/test_firebase_auth.py`; it must not be `authentication/tests/` because that package would shadow the Selenium module `authentication/tests.py`). Fixtures: `fake_firebase` extended so a token can map to a dict of claims (`{'uid': ..., 'email': ..., 'name': ...}`), backward compatible with the current uid-string form. Users: alice `uid-alice`, bob `uid-bob`. Endpoint: `GET /api/user-profile`.

| Test | Input | Expected |
|---|---|---|
| valid token, registered | `Bearer tok-bob`, DB has alice and bob | 200, body `email` is bob's |
| no Authorization header | none | 401 |
| scheme not Bearer | `Token tok-alice` | 401 |
| invalid token | `Bearer nope` | 401 |
| valid token, uid not in DB | `Bearer tok-carol` | 401, no User row created |

**Red first (behavior change, body only, status unchanged)**
| Test | Expected |
|---|---|
| invalid token body | 401, `error` contains "Invalid or expired" |
| unregistered body | 401, `error` contains "not registered" |
| expired token (fake raises `auth.ExpiredIdTokenError`) | 401, same invalid message |
| Firebase not initialised / cert fetch error (fake raises `auth.CertificateFetchError`) | not 401 (propagates as 5xx), logged at ERROR |

**Mutants** (`backend/mutations/phase4/`, see section 6 for format): M01 user looked up as `User.objects.first()`; M02 unregistered uid falls back to first user; M03 scheme check loosened to `split(' ')[-1]`; M32 `authenticate_header` removed (403 instead of 401); M33 invalid-token handler returns a user instead of raising.

### B2. Dead and duplicate endpoints: fix (deleting needs approval)
- `verify_token` (`views.py:14-41`, route `authentication/urls.py:7` as `verify-token`, no `api/` prefix): frontend never calls it; `authStore.ts:81` defines `/api/verify-token`, a path that does not exist, and never uses it. Its clock-skew branch (`:31-36`) can never run, because `verify_id_token` rejects future-dated tokens first (zero skew by default).
- `check_user` (`views.py:147-171`): never called by the frontend; routed twice, `django_backend/urls.py:15` and `authentication/urls.py:10`; labels `is_active=False` as "Profile incomplete" and answers 404.
- **Approved (decision 4)**: delete both views and their routes (also removes the duplicate).
- Tests: none for a removed route (docs/testing.md: no asserting that a removed name stays removed). Evidence: `grep` finds no frontend caller; the mutation runner and the whole suite stay green.

### B3. Serializer convention: fix
**What is wrong**: the profile response is built inline twice and the two already disagree: `user_profile` (`views.py:122-131`) returns 8 keys including `auth_methods` with pointless `getattr(user, ..., None)`; `update_profile` (`:234-242`) returns 7 keys without `auth_methods`. Input is read straight from `request.data` with no type or length checks (see B8).

**Change** (DRF is already installed; no new package): `authentication/serializers.py` with
- `UserProfileSerializer` (output): `email, institution, bio, research_interests, auth_methods, first_name, last_name, password_set`; `research_interests` as a list of names. `user_profile` response bytes stay identical. `update_profile` gains `auth_methods` (additive; the frontend refetches the profile after an update anyway and ignores the response body).
- `ProfileUpdateSerializer` (input): optional `institution` (max 100), `bio`, `first_name` (max 150), `last_name` (max 150), `research_interests` (list of trimmed non-blank strings, each max 100). Unknown keys such as `email` ignored. `register` and `set_password` get small input serializers too.

**Pin**: P1 below. Mutants: M04 `research_interests` returns all interests instead of the user's; M05 first/last name swapped; M34 `password_set` omitted from the response.

| Test | Setup | Expected |
|---|---|---|
| profile shape | alice: institution "QMUL", bio "b", first "Alice", last "Smith", auth_methods "EMAIL", password_set True, interests {"biology","zoology"}; bob has interest "chemistry" | 200; keys exactly `{email, institution, bio, research_interests, auth_methods, first_name, last_name, password_set}`; values as set up; `sorted(research_interests) == ["biology","zoology"]` (order is not specified by the model, so the test sorts) |
| user without interests | new user | `research_interests == []` |

### B4. Error-response convention: fix, plus approved redesign E1
**What is wrong**
- Three body shapes: `{"error": "..."}` (the de facto convention in `authentication`, `livestream` and `papers` views, and the only one the frontend reads: `data.error` in `authStore.ts:254,322,405-434,506,595`), DRF's `{"detail": "..."}` for authentication and permission failures, and ad hoc `{"message": ...}` / `{"warning": ...}` (`views.py:34,165`).
- Every view wraps its body in `try/except Exception` and returns `500 {"error": str(e)}` (`views.py:39-41,96-98,142-144,169-171,194-195,250-252,260-261,279-280`). That leaks internals (probe: `NOT NULL constraint failed: authentication_user.username`) and turns client mistakes (missing header, bad token) into 500.
- `get_research_interests` and `sync_reset_password` have no logging at all.

**Fix**: the convention is `{"error": "<message>"}`, with these statuses: 400 validation, 401 authentication, 403 forbidden, 404 not found, 409 conflict. Auth views drop blanket try/except; expected failures are raised as DRF exceptions (`ValidationError`, `AuthenticationFailed`, `NotFound`) or serializer errors; real bugs surface as 500 and are logged by Django.

**E1, redesign (approved, decision 3)**: one `REST_FRAMEWORK['EXCEPTION_HANDLER']` that renders every DRF-raised error as `{"error": message}`, so the 401/403/404/400 produced by DRF itself match. One settings key (code, not env). It changes the body of those errors in all apps. I grepped: nothing in the frontend or tests reads `detail` (`room/[roomId]/page.tsx:998` reads `err.cause.details`, a LiveKit field). E1 is approved, so the convention applies to every app.

Unhandled non-DRF exceptions render Django's HTML 500 page, which is why F2's client must not assume JSON on error.

**Pin**: the status codes of every auth view for success, unauthenticated and invalid input (listed per endpoint below). Red first: error bodies.
| Test | Expected |
|---|---|
| any 4xx from an auth view | body is exactly `{"error": <non-empty string>}` (needs E1 for DRF-raised ones) |
| forced unexpected exception in a view (patch the model manager at the DB boundary) | 500, body does not contain the exception text |

Mutants: M30 handler renders `detail` again; M31 500 body includes `str(e)`.

### B5. `register`: fix
**What is wrong** (`views.py:45-98`)
- Probe: no `Authorization` header gives `500 {"error": "'authorization'"}` (KeyError, `:49`); a bad token gives 500 with the Firebase message; a token without an `email` claim gives 500 `NOT NULL constraint failed: authentication_user.username` (`:81-82`, `username=email`).
- Existing user plus password returns "Password updated" (`:73-76`) without touching `password_set`.
- Google users: `password_set=True if data.get('password')` (`:88`) while the password is ignored for Google (`:91`).
- Name split for Google (`:63-65`) is correct but duplicated three times.
- Concurrent double submit hits the unique `firebase_uid` / `username` constraint: 500. Treat `IntegrityError` on create as "already exists" (idempotent), not 500.

**Pin first** (green on current code). Tokens: `tok-alice` claims `{uid: uid-alice, email: alice@example.com}`; `tok-gina` claims `{uid: uid-gina, email: gina@example.com, name: "Gina Maria Lopez"}`.

| Test | Request | Expected |
|---|---|---|
| email signup | alice token, body `{first_name:"Alice", last_name:"Smith", password:"pw-1234", institution:"QMUL", bio:"hi"}` | 200 `{"message":"User created/updated successfully"}`; one User: `firebase_uid="uid-alice"`, email and username `alice@example.com`, names, institution, bio as sent, `auth_methods="EMAIL"`, `password_set=True`, `check_password("pw-1234")` True, stored hash != `"pw-1234"` |
| email signup without password | same, no password | `password_set=False` |
| auth_methods default and case | omitted -> `"EMAIL"`; `"Google"` -> `"GOOGLE"` | as stated |
| Google signup | gina token, body `{auth_methods:"google", first_name:"Ignored"}` | `first_name="Gina"`, `last_name="Maria Lopez"`, `auth_methods="GOOGLE"` (body names ignored) |
| Google single-word name | claims name "Gina" | `last_name=""` |
| existing user plus password | alice exists, body `{password:"pw-new"}` | 200 `{"message":"Password updated"}`, `check_password("pw-new")` True, still one User |
| existing user, no password, other fields | alice exists, body `{institution:"X"}` | 200 `{"message":"User created/updated successfully"}`, institution unchanged |
| unauthenticated is allowed through to the token check | no header | not 403 (see red tests) |

**Red first**
| Test | Expected |
|---|---|
| no Authorization header | 401, body `{"error": ...}`, no User created |
| invalid token | 401 |
| valid token, no `email` claim | 400, body `error` mentions email, no User created |
| Google registration with a password in the body | `password_set=False` (password is ignored for Google, so the flag must not claim otherwise) |
| double submit (second call after create) | 200, one User |
| 4xx/5xx bodies | never contain "constraint" or a traceback |

**Mutants**: M06 `.upper()` -> `.lower()`; M07 Google last name takes only the last token (`[1:]` -> `[-1:]`); M08 `username=email` -> `username=first_name`; M09 `password_set` inverted; M10 `set_password` skipped for email users; M11 existing-user lookup removed (always create); M12 Google takes names from the body; M35 `institution` / `bio` dropped from `create`; M36 missing-token check removed (register accepts anonymous).

### B6. `set_password`: fix
**What is wrong** (`views.py:174-195`): dead header parse (`:177-178`; request is already authenticated), `save()` twice (`:184,188`), blanket 500. Behavior to keep: `auth_methods` becomes `auth_methods + 'EMAIL'` (`:187`), so a Google user ends as `"GOOGLEEMAIL"`. That value is a concatenated flag string, the frontend depends on `.includes('EMAIL')` (`PasswordSettings.tsx:29`), the column is 50 chars. Keep it (changing the representation is a data-model change); pin it.

| Test | Setup and request | Expected |
|---|---|---|
| email user changes password | alice `EMAIL`, password_set True; `{password:"new-pass-9"}` | 200 `{"message":"Password updated successfully"}`; `check_password("new-pass-9")` True; `auth_methods == "EMAIL"` |
| Google user adds a password | gina `GOOGLE`, password_set False | 200; `auth_methods == "GOOGLEEMAIL"`; `password_set` True; `check_password` True |
| missing password | `{}` | 400 `{"error":"No password provided"}`; password unchanged |
| empty string | `{password:""}` | 400; unchanged |
| unauthenticated | no header | 401 |

Mutants: M13 `'EMAIL' not in` inverted; M14 `password_set` never set; M15 empty password accepted; M37 `set_password` on the wrong user (first user).

### B7. `sync_reset_password` (security): fix
**What is wrong** (`views.py:264-280`): `@permission_classes([AllowAny])` plus the email taken from the body (`:268-271`): anyone on the internet can set the Django password of any registered email; if that user is staff, that is a login to `/admin/`, and it also works for `SessionAuthentication`. A missing `password` makes `set_password(None)` store an **unusable** password. The frontend (`ResetPassword/page.tsx:75-85`) already sends the user's Bearer token, so authentication costs it nothing.

**Fix**: remove `AllowAny` (default `IsAuthenticated`), use `request.user`, ignore any `email` in the body, 400 when `password` is missing or blank. The frontend payload stays compatible; the page stops sending `email` in F2. Response message unchanged.

| Test | Setup and request | Expected |
|---|---|---|
| authenticated reset (green before and after) | alice token, `{password:"reset-pw-5"}` | 200 `{"message":"Password synced successfully"}`; alice `check_password("reset-pw-5")` True |
| red first: anonymous | no header, `{email:"alice@example.com", password:"x-hack-1"}` | 401; alice's password unchanged (today: 200 and changed) |
| red first: other user's email in body | alice token, `{email:"bob@example.com", password:"pw-z"}` | alice changed, bob unchanged |
| red first: missing password | alice token, `{}` | 400; `has_usable_password()` still True |

Mutants: M16 `AllowAny` restored; M17 lookup by body email; M18 blank-password check removed.

**P1, redesign (declined, decision 6; moved to `docs/future-todos.md`)**: the Django-side password is used by nothing in the product (login is Firebase; Django passwords only matter for `/admin/` and DRF `SessionAuthentication`). Mirroring means the plaintext password is POSTed to our server at signup (`authStore.ts:313-317`), set-password (`:587-590`) and reset (`ResetPassword:81-84`), and three endpoints exist to keep two copies in sync (the failure case "reset in Firebase succeeded but sync failed" is a real state in `ResetPassword:131-134`). Dropping it removes the plaintext transfer and `sync_reset_password` altogether, but changes the data model use of `password_set` and what "set password" means for the admin account, so it needs your decision. The fix above is what ships.

### B8. `update_profile`: fix
**What is wrong** (`views.py:197-252`): no validation (`institution` max 100, `first_name` max 150, interest name max 100: SQLite does not enforce lengths, Postgres raises `DataError` -> 500); interests: `ResearchInterest.objects.get_or_create(name=...)` with `None` raises `IntegrityError`, ints are coerced to strings, blank and whitespace-only names are created; `user.save()` then `clear()` then `add()` is not atomic (an error midway leaves the user with no interests); a non-list `research_interests` is silently ignored (`:223`) and a string would iterate characters if the guard were lost; two nested `try/except` returning `str(e)`.

**Pin first** (green):
| Test | Setup and request | Expected |
|---|---|---|
| partial update | alice (institution "A", bio "B"), `{bio:"new"}` | 200; `bio="new"`, `institution="A"` unchanged |
| all text fields | `{institution:"MIT", bio:"x", first_name:"Al", last_name:"Sm"}` | persisted in DB; response carries the same four values and `email` |
| interests replace | alice has {"old"}; `{research_interests:["Neuroscience","AI"]}` | profile interests exactly {"Neuroscience","AI"}; `ResearchInterest` row "old" still exists |
| reuse existing row | "AI" already exists (id N); request includes "AI" | still one "AI" row, same id |
| empty list clears | alice has {"x"}; `{research_interests: []}` | user has none |
| not a list is ignored | alice has {"x"}; `{research_interests:"AI"}` | 200; interests still {"x"}; no rows "A" or "I" created |
| email in body ignored | `{email:"evil@example.com"}` | email unchanged |
| unauthenticated | none | 401 |

**Red first**:
| Test | Expected |
|---|---|
| `institution` of 101 chars | 400, `error` names the field, nothing changed |
| interest name of 101 chars, blank `""`, `"   "`, `null`, `7` | 400, nothing changed |
| valid then invalid interest in one list (`["ok", ""]`) | 400 and the user's previous interests intact (atomic) |
| `"  AI "` | stored and returned as `"AI"` |
| response now includes `auth_methods` | equals the stored value |

**Change**: `ProfileUpdateSerializer` (B3), `transaction.atomic`, `user.research_interests.set(...)`. Case variants ("AI" vs "ai") remain distinct rows (unique is case-sensitive); changing that is a data-model decision, not made here.

Mutants: M19 `.clear()` removed; M20 `user.save()` removed; M21 list guard removed; M22 `'bio' in data` guard -> unconditional `data.get('bio','')` (partial update wipes); M23 blank interest accepted; M24 `transaction.atomic` removed.

### B9. Research interests served by one view: fix
**What is wrong**: two views for the same data. `authentication/views.py:254-261` at `/api/research-interests` (default `IsAuthenticated`) and `livestream/views.py:672-680` at `/api/livestream/research-interests` and `.../research-interests/` (`AllowAny`, local import inside the function; `livestream/urls.py:20-21`). **Real bug**: the profile page loads suggestions through `authStore.fetchResearchInterests` (`authStore.ts:673-684`), which fetches `/api/research-interests` with **no Authorization header**, so the backend answers 401 and the function returns `[]`. Probe: `GET /api/research-interests` without token -> 401. The profile dropdown (`profile/page.tsx:47`) therefore never offers existing interests; the rooms page works only because it uses the livestream copy (`livestreamStore.ts:478`). `authStore.ts:86` also defines an unused `RESEARCH_INTERESTS` constant, and the call is a relative URL that works only through the `next.config.js` rewrite.

**Fix** (decision 5): keep the `authentication` view, since that app owns `ResearchInterest`; make it public (names carry no user data, and both callers need to work before/without a token); delete the livestream view and its two routes; the single frontend function calls it through the F2 client; `livestreamStore.fetchResearchInterests` delegates to it. This is a small touch in `livestream/views.py`, `livestream/urls.py` and `livestreamStore.ts` (phase 7 files), limited to removing the duplicate. Phase 7 owns the rest (the interest `get_or_create` loops at `livestream/views.py:241-244,294-297` stay for phase 7).

| Test | Setup | Expected |
|---|---|---|
| sorted by name | rows inserted as "zoology","biology","chemistry" | 200 `["biology","chemistry","zoology"]` (all lowercase on purpose: ordering of mixed case depends on database collation; see credential check 10 for Postgres) |
| empty | none | 200 `[]` |
| red first: no token | anonymous | 200 (today 401) |
| shape | one row | list of strings, not objects |

Mutants: M25 `order_by('name')` dropped; M26 `IsAuthenticated` restored; M27 returns `[{"name": ...}]`.

### B10. Logging: fix
**What is wrong**: `print` at `authentication/authentication.py:38`, `settings.py:205` (startup warning), `papers/services.py:24,29,76,135`. (`papers/views.py` has none now; the roadmap line predates phase 2.) `papers/services.py` has no `logger`. There is no `LOGGING` setting, so Django's default applies: records at WARNING and above reach stderr, INFO and below are dropped. These prints are therefore not covered by any log config and the retry messages interleave with test output.

**Fix**: module `logger = logging.getLogger(__name__)`; WARNING for transient retry lines (`services.py:24,29`), ERROR with `exc_info` for the two swallowed enrichment exceptions (`:76,135`), WARNING in `authentication.py` (and ERROR for Firebase not initialised), `logging.getLogger(__name__).warning(...)` in `settings.py` (a `logger` cannot be configured yet at settings import, but the default handler prints it). **No `LOGGING` dict**: it would be a new config option and the default output is sufficient. Messages must not include tokens or the Authorization header (already removed in phase 1).

Papers: this is a four-line swap in phase 5's file, mechanical only, no logic; flagged so phase 5 rebases onto it. Approved (decision 9).

| Test | Trigger | Expected |
|---|---|---|
| retry on 429 | `fetch_with_retry` with `FakeHTTP` returning 429 then 200 | `assertLogs('papers.services', 'WARNING')` has one record containing "429"; stdout empty (`contextlib.redirect_stdout`) |
| connection error | `FakeHTTP` raising `requests.ConnectionError` twice | two WARNING records; result None |
| swallowed DOI enrichment error | malformed CrossRef body | one ERROR record from `papers.services`; the other results still enriched |
| invalid Firebase token | `GET /api/user-profile` with `Bearer nope` | WARNING from `authentication.authentication`; stdout empty |

Mutants: M28 `print` restored in `authentication.py`; M29 `print` restored in `fetch_with_retry`. (The phase 3 retry tests stay as they are.)

### B11. Migrations: leave as is (decision)
- `authentication/migrations/0007_alter_user_id` sets `AutoField`, `0008_alter_user_id` (two days later) sets `BigAutoField` again; `0001` already created `BigAutoField` and `DEFAULT_AUTO_FIELD` is `BigAutoField` (`settings.py:194`). Net schema equals the model; `makemigrations --check` is clean. 0007 is a mistaken intermediate that 0008 reverts. **Decision: do not edit, delete or squash.** A squash only helps a fresh database, which already migrates correctly; both files are applied on the user's local databases.
- `livestream`: `0003` -> `0005` (explicit dependency in `0005`). There is no `0004` in git history (`git log --all` finds none); it was never committed. Harmless numbering gap. `0005` and `0006` are no-op `RunPython`; `0005` has no reverse function, so migrating `livestream` backwards past it fails. Leave; irrelevant for a fresh deploy.
- Evidence to collect during the phase: `python manage.py makemigrations --check --dry-run` (clean today), the test runner itself migrates from scratch on SQLite every run, and one `migrate` on an empty local PostgreSQL (see credential/infra check 10) to prove that 0007's narrowing then 0008's widening of `User.id` and the foreign keys to it works on Postgres.
- No tests or mutants (no code).

## 4. Frontend

There is no frontend test runner (phase 3 parking lot, "revisit if phase 4 wants frontend logic tests"). Checks available now: `npm run lint` (ratchet), `npm run typecheck`, `npm run build`. Decision 2 approves Node's built-in `node --test` for the logic modules (section 6).

### F1. One config module: fix
**What is wrong**: `process.env.NEXT_PUBLIC_API_BASE_URL` is read 11 times in 6 files: `authStore.ts:79`, `ResetPassword/page.tsx:8`, `livestreamStore.ts:96`, `extracts/page.tsx:39,83`, `paperStore.ts:151,180,297,341,392`, `api/token/route.ts:21`; Firebase keys in `lib/firebase.ts:8-13`; LiveKit URL in `room/[roomId]/page.tsx:1264`. If the variable is unset every URL silently becomes `undefined/api/...`.

**Change**: `src/lib/config.ts` exporting `API_BASE_URL`, the Firebase config and `LIVEKIT_URL`. Next.js inlines only literal `process.env.NEXT_PUBLIC_X` reads, so each is a literal access; trailing slash trimmed; a missing variable throws an error that names it. `.env.example` already lists all of them (no new variable). `lib/firebase.ts` reads from the config module.

Behaviors to pin with `node --test` (`frontend/tests/config.test.ts`; `config.ts` exposes a pure `readConfig(env)` that takes the env object, so the test needs no `process.env` mutation, and a thin module-level export with the literal `process.env.NEXT_PUBLIC_*` reads):
| Test | Input | Expected |
|---|---|---|
| trailing slash | `http://localhost:8000/` | `http://localhost:8000` |
| join | base `http://localhost:8000`, path `/api/user-profile` | `http://localhost:8000/api/user-profile` |
| missing variable | unset | throws, message contains `NEXT_PUBLIC_API_BASE_URL` |

### F2. Typed API client and consistent error handling: fix
**What is wrong**: auth code has 7 raw `fetch` calls (`authStore.ts:236,307,398,494,581,675`, `ResetPassword:75`), each building headers by hand, each doing `await response.json()` on the error body (`authStore.ts:250,321,405,504,594`), which throws `SyntaxError` on Django's HTML 500, so the user sees "Unexpected token <" instead of a message. Error text selection (`data.error || '...'`) is repeated and inconsistent with DRF's `detail`.

**Change** (built on `fetch`, same endpoints, same payloads): `src/lib/apiClient.ts`
- `apiRequest<T>(path, { method, body, auth })`: absolute URL from config; JSON `Content-Type` and body when a body is given; `Authorization: Bearer <id token>` where the token comes from `auth.currentUser.getIdToken()` at request time (the Firebase SDK refreshes it when close to expiry), not from the persisted store copy; on non-2xx throws `ApiError(status, message)` with `message = body.error ?? body.detail ?? "Request failed (HTTP <status>)"`, tolerating non-JSON bodies; network failure -> `ApiError(0, "Cannot reach the server")`.
- Typed functions in `src/lib/api/auth.ts`: `register`, `getProfile`, `updateProfile`, `setPassword`, `syncResetPassword`, `getResearchInterests`, with response types from F4.
- `ResetPassword/page.tsx` uses it and stops sending `email` (B7).
- Scope (decision 1): auth/profile call sites only; other stores migrate in phases 5-7.

Behaviors to pin with `node --test` (`frontend/tests/apiClient.test.ts`; `apiRequest` takes `{ baseUrl, getToken, fetchImpl }` as a factory argument, so the test injects a fake `fetch` and needs no Firebase): 
| Test | Fake `fetch` returns | Expected |
|---|---|---|
| attaches token | token getter -> `"abc"` | request header `Authorization: Bearer abc`; no header when the getter returns null |
| JSON body | body `{a:1}` | `Content-Type: application/json`, body `{"a":1}` |
| error body | 400 `{"error":"bad"}` | throws `ApiError` status 400, message `bad` |
| detail fallback | 401 `{"detail":"nope"}` | message `nope` |
| HTML 500 | 500 `<html>` | `ApiError` status 500, message `Request failed (HTTP 500)`, no SyntaxError |
| network failure | `fetch` rejects | `ApiError` status 0 |
| success | 200 `{"ok":true}` | resolves to `{ok:true}` |

Hand mutants for the report (the Python runner cannot run frontend mutants): drop the `Authorization` header; swallow non-OK; join without trimming the slash; message prefers `detail` over `error`.

### F3. `authStore` cleanup: fix
Items, in order of impact:
1. **Retry uses the rejected token** (`:375-435`): `currentToken = token` (the persisted copy, `:379-380`) is refreshed only when it is empty or the error mentions "Token used too early" (`:382`). On a 401 the loop waits 1 s and retries with the same token (`:408-412`), then signs the user out with "authenticated with Firebase but not registered" (`:415-431`). The store persists `token`, `isAuthenticated` and `user` in localStorage (`:689-693`), so after the one-hour ID token lifetime a reload can hit three 401s and force a logout of a valid Firebase session. The F2 client fetches a fresh token per request, which removes the cause; the retry then only needs to cover the backend-sync race right after signup.
2. **Clock-skew hacks**: `getAuthToken` retry (`:23-33`), checks at `:382,455`, a module-level `setInterval` every 2 s (`:706-711`) and `setTimeout` at import (`:699-704`) exist because the backend verifies with zero skew (`verify_id_token(..., clock_skew_seconds=0)`, signature checked in firebase_admin 6.7). With `clock_skew_seconds=60` in the backend helper (approved, decision 7) the frontend workarounds are deleted.
3. **Typing**: 15 `any` (all `catch (error: any)`) and 3 `@ts-ignore` (`:662-668`, `window._authUnsubscribe`). Use `unknown` plus a `getErrorMessage` helper and a Firebase error code check; keep the unsubscribe handle in a module variable.
4. **Dead code**: `AUTH_ENDPOINTS.VERIFY_TOKEN` (wrong path) and `RESEARCH_INTERESTS` (`:81,86`); the unused `provider` local (`:439-442`) and `User.provider` (`:43`) that the backend never returns.
5. **Duplicated flow**: `login` (`:102-155`) and `googleLogin` (`:158-216`) share the same fetch-profile / sign-out-on-failure block; `login`, `register`, `registerGoogleUser` repeat the same error reset block. Extract the shared step; no behavior change.
6. `register` (`:294-354`): if the backend call fails after `createUserWithEmailAndPassword`, the Firebase account stays (and `signOut(auth)` is not awaited, `:340`). The next login then ends in "not registered" (`:421`) and signup says email already in use: the user is stuck. Fix (approved, decision 8): on backend failure delete the new Firebase user (`userCredential.user.delete()`), then sign out. Needs the Firebase check.
7. `syncAuthState` (`:632-670`) sets `isAuthenticated: true` before the profile has loaded (`:641`), so the UI can show a signed-in state the backend would reject; it is also called at import and by `app/page.tsx:16` (the previous listener is replaced, so no leak). Only set it after `fetchProfile` succeeds.
8. `updateProfile` already refetches the profile (`:510`) and the profile page does it again (`profile/page.tsx:98-100`), and loads the interests twice (`:27-29,33-43`). Remove the duplicates.
9. The persisted `token` stays for now: `paperStore.ts:132,175,282,332,385` and `livestreamStore.ts:251,349,448,543` read it. Removing it is parked until those phases use the client.

Pin: no frontend runner. Verification is typecheck + build + lint ratchet lowered with `node scripts/lint-baseline.mjs --update`, plus the manual flows in section 7.

### F4. Shared types and `no-explicit-any`: fix
`User` is declared inside the store (`:38-48`). Move it to `src/types/user.ts` matching `UserProfileSerializer` (B3), add `ProfileUpdate` and `ApiErrorBody`, and import it from the client, store, `PasswordSettings`, profile page. `no-explicit-any` in phase 4 files, from `lint-baseline.json`: `authStore.ts` 15, `ResetPassword` 3, `ForgotPassword` 1, `LoginForm` 2, `PasswordSettings` 1 = 22 of 52. Also `ban-ts-comment` 3 and the unused vars in `authStore.ts`, `LoginForm`, `SignupForm`, `PasswordSettings`, `Navbar`. The other 30 `any` (room page 21, rooms page 2, extracts 2, paperStore 2, livestreamStore 2, `api/token` 1) belong to phases 5-7; I lower the baseline only for what I fix.

### F5. Auth and profile flows
| Flow | Today | Problems |
|---|---|---|
| Email signup | `SignupForm` -> `register` -> Firebase `createUser` -> `POST /api/register` (incl. plaintext password) -> `fetchProfile` | Orphan Firebase user on backend failure (F3.6); 500 on bad input (B5) |
| Google signup | `registerGoogleUser`: popup -> `POST /api/register` | Needs a second popup if the user first pressed "Log in" with Google (their Firebase account exists but has no Django row) |
| Email login | `login`: Firebase sign-in -> `fetchProfile` | `LoginForm.tsx:47-49` and `:64-66` compare the render-time `isAuthenticated` (still `false`) after a successful `await login()`, so every successful login sets "User not found in system" before the redirect; if the redirect effect is slow the message is visible. Remove the check; the store already throws on failure |
| Google login | `googleLogin`: popup -> `fetchProfile` | `auth/popup-closed-by-user` is shown as "Incorrect account information" (`:196-200`); unregistered Google user gets "not registered" (correct, by design) |
| Set password | `setPassword`: reauth -> `updatePassword` -> `POST /api/set-password` | If the backend call fails the Firebase password is already changed and the two copies differ (P1 context) |
| Forgot / reset | `sendPasswordResetEmail`; reset page: `verifyPasswordResetCode` -> `confirmPasswordReset` -> sign in -> `POST /api/sync-reset-password` | Endpoint unauthenticated (B7); success leaves the user signed in to Firebase without the store knowing until `syncAuthState` fires |
| Profile update | `updateProfile` -> `POST /api/update-profile` -> `fetchProfile` | B8; duplicate refetch (F3.8) |

## 5. Noted, not mine (parking lot candidates)
- **Phase 7**: `livestream/views.py:241-244,294-297` duplicate the interest `get_or_create` loops; local imports of `ResearchInterest` at `:241,294,676`.
- **Phase 7 or after**: remove the persisted `token` from `authStore` once papers, extracts and rooms use the client; `api/token/route.ts` should use the config module and the client.
- **Phase 5/6/7**: convert their `fetch` calls to the client (decision 1); `paperStore.ts:392` known bug stays with phase 6.
- **Phase 12**: `settings.py:158-171` is overwritten by `:213-223` (validators disabled "for testing DELETE WHEN DONE"); `STATIC_URL` defined twice (`:67`, `:189`); `DEBUG=True`; `next.config.js` rewrites hard-code `localhost:8000` (the relative `/api/...` fetches I remove were the only ones depending on it).

## 6. Test and mutant plan

**Files** (new, `backend/authentication/`, discovered by the `test*.py` pattern; no `tests/` package, which would shadow the Selenium `tests.py`): `test_firebase_auth.py`, `test_register.py`, `test_profile.py`, `test_password.py`, `test_research_interests.py`, `test_logging.py`; the `papers.services` logging tests go in `papers/tests/test_enrichment.py` style (new `papers/tests/test_logging.py`). Test utility: `testsupport/auth.py` `fake_firebase` accepts a claims dict per token (backward compatible); it raises `ValueError` today, tests also need `auth.ExpiredIdTokenError` and `auth.CertificateFetchError`. Test fixtures use `django.test.TestCase` and DRF `APIClient`; no network.

**Mutants** live in `backend/mutations/phase4/` (the existing phases keep theirs in `backend/mutations/phase3/`; the runner globs `mutations/*/*.patch`), named `Mxx-slug.patch`, one-line production bugs, created with `git diff -- <file> > ...; git checkout -- <file>`, never touching tests, `testsupport/`, `scripts/` or `mutations/`. Planned IDs: M01-M03 and M32-M33 (B1), M04-M05 and M34 (B3), M30-M31 (B4), M06-M12 and M35-M36 (B5), M13-M15 and M37 (B6), M16-M18 (B7), M19-M24 (B8), M25-M27 (B9), M28-M29 (B10). 38 total (M38 is the clock-skew argument, below); each is listed with its issue above, and each must be killed by a named test. IDs are only labels; real file names get their slug when written.

**Frontend tests** (decision 2): `frontend/tests/*.test.ts`, run by one new script `"test": "node --experimental-strip-types --test tests/"` in `frontend/package.json` (Node 22 here; no new package, `@types/node` is already installed so `tsc --noEmit` covers the tests). Constraint to verify when implementing: with type stripping, relative imports in these files need an explicit `.ts` extension, which `tsc` rejects without `allowImportingTsExtensions: true` (safe with `noEmit`, one tsconfig line). If that proves unacceptable, the modules under test stay free of relative imports instead. Tests are written first and watched failing, like the backend ones. The tables in F1 and F2 are the cases. Added cases: `readConfig` returns every Firebase key unchanged; `apiRequest` with a relative path lacking a leading slash still joins with exactly one `/`; query strings are kept. Hand mutants (the Python runner cannot apply them), each run once by hand and reverted, results in the phase report: F1 trailing slash not trimmed; F1 missing variable returns `undefined`; F2 `Authorization` header dropped; F2 non-OK swallowed (resolves); F2 `detail` preferred over `error`; F2 HTML body throws `SyntaxError` instead of `ApiError`; F2 network failure status 1 instead of 0.

**Backend token verification** (decision 7), red first in `test_firebase_auth.py`: the fake `verify_id_token` records its keyword arguments; a request must call it with `clock_skew_seconds=60` (the contract with the Firebase SDK, signature checked in firebase_admin 6.7). Mutant M38: argument dropped (zero skew). Total mutants: 38.

**Backend additions from the decisions**: B4 gets the E1 handler tests (its rows already assume E1; mutant M30 is the handler rendering `detail`); B2 has no tests (deleted routes); B9 test "old livestream route" is not written (removed names are not asserted); `papers/tests/test_logging.py` as in B10.

**Order of work** (separate commits, per the method):
1. Test utility extension, characterization tests (the "pin first" rows), and mutants for the current code. All green on unchanged code; run the mutation runner: every mutant killed.
2. Refactors that keep behavior (helper, serializers, logging swap, remove dead blocks and the confirmed dead endpoints, merge the interest views). Mutants that go stale are re-created in the new code under the same name, never deleted.
3. Behavior fixes, one concern per commit, each starting with its "red first" test watched failing for the stated reason: 401/400 instead of 500 in `register`; `sync_reset_password` authentication; `update_profile` validation and atomicity; public research interests; error body convention; invalid-token messages.
4. Frontend (tests first for `config.ts` and `apiClient.ts`): config, client, types, `authStore`, `ResetPassword`, `LoginForm`, profile page; lint baseline lowered.
5. Verify: `python manage.py test` (also `--shuffle 1`), `makemigrations --check --dry-run`, `python scripts/mutation_check.py`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (placeholder `NEXT_PUBLIC_*`), report.

**Done when** (roadmap): auth helper, serializers, logger-only logging and a single interests view in place; typed client and one config module used by the auth/profile code (scope per decision 1); phase 4 files free of `any`; migration decision recorded (B11); all checks above pass; user click-through of section 7.

## 7. Checks that need your credentials (Firebase) and a running stack

Setup: `backend/.env` with `SECRET_KEY` and `FIREBASE_SERVICE_ACCOUNT`; `frontend/.env.local` with the `NEXT_PUBLIC_FIREBASE_*` keys and `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`; fresh database (`rm backend/db.sqlite3; python manage.py migrate`); `python manage.py runserver 8000`; `npm run dev` (3000). Firebase console, Authentication: email/password and Google providers enabled, `localhost` in authorized domains. To see a stored user: `python manage.py shell -c "from authentication.models import User; u=User.objects.get(email='X'); print(u.firebase_uid,u.auth_methods,u.password_set,u.check_password('PW'))"`. To get an ID token for `curl`: browser devtools console `JSON.parse(localStorage['auth-storage']).state.token` (after phase 4 the token is fetched fresh per request; the stored copy can be stale).

Run before the phase (baseline, for comparison) and after:
1. **Email signup**: `/Signup` with `phase4a@example.com`, names, password. Expect redirect to `/profile`. Shell: `auth_methods='EMAIL'`, `password_set=True`, `check_password(pw)` True.
2. **Logout, email login**: wrong password -> "Incorrect account information"; correct password -> home. After phase 4 no "User not found in system" flash.
3. **Google signup** with an account never used: expect `/profile?provider=google&newUser=true`. Shell: `auth_methods='GOOGLE'`, `password_set=False`, `first_name` and `last_name` from the Google name.
4. **Google login** with that account after logout -> signed in. With a Google account that is **not** registered (e.g. a second one) -> error "authenticated with Firebase but not registered" and you are signed out of Firebase.
5. **Unregistered Firebase user**: create `ghost@example.com` in the Firebase console (Users -> Add user), log in on `/Login`. Expect the "not registered" error. Also `curl -i -H "Authorization: Bearer <token>" http://localhost:8000/api/user-profile`. Before: `401 {"detail":"Authentication credentials were not provided."}`. After: `401 {"error":"... not registered ..."}`.
6. **Profile update**: change names, institution, bio; add two interests; reload: all persisted; remove one: persisted. Before: the interest suggestion dropdown is empty. After: it lists existing interests (open it with the field focused).
7. **Set password for a Google user** (Profile -> password tab): reauth popup, set `Pw-12345`; logout; log in with email + that password; shell: `auth_methods='GOOGLEEMAIL'`, `password_set=True`, `check_password` True. Then **change password** for the email user (current + new); log in with the new one; shell hash matches.
8. **Forgot / reset**: `/ForgotPassword`; in Firebase console -> Authentication -> Templates -> Password reset -> customize action URL to `http://localhost:3000/ResetPassword` (otherwise the link opens Firebase's own page and the app's reset code never runs); click the emailed link; set a new password; expect success and redirect; log in with the new password; shell `check_password(new)` True.
9. **Sync-reset hole** (after phase 4 only): `curl -i -X POST localhost:8000/api/sync-reset-password -H 'Content-Type: application/json' -d '{"email":"phase4a@example.com","password":"x-hack-1"}'`. Before: 200 and the password changed. After: 401, shell shows the password unchanged.
10. **Postgres migration and collation** (not credentials, needs a local PostgreSQL 16): empty database, `DATABASE_SERVICE_NAME`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_PORT` set, `python manage.py migrate` completes (covers 0007 -> 0008); `GET /api/research-interests` with interests `Zoology`, `biology` is ordered by the database collation (documented, not asserted).
11. **Orphan check** (decision 8): temporarily stop the backend, sign up in the UI, expect an error; restart the backend and sign up again with the same email -> must succeed (before: "email-already-in-use"). Then the Firebase console must show one user.
12. **Clock skew** (decision 7): with the machine clock set 30 s behind, log in; before: occasional "Token used too early"; after: no error. Restore the clock.

The optional Selenium suite (`RUN_SELENIUM=1`, frontend on 4000) is unaffected by this phase's backend routes and is not part of the Definition of done.

## 8. Decisions (approved)

Approved by the user after reading this analysis. Implementation has not started.

1. **Frontend scope**: convert only the auth/profile call sites in phase 4 (`authStore`, `ResetPassword`, `firebase.ts`, `LoginForm`, profile page). Paper, extract and room fetches stay on raw `fetch` until phases 5-7 (parking lot in section 5).
2. **Frontend tests**: approved. `node --test` (Node's built-in runner) with one `npm run test` script and no new package, for `config.ts` and `apiClient.ts` (section 6, "Frontend tests").
3. **E1 approved**: global `REST_FRAMEWORK['EXCEPTION_HANDLER']` rendering every DRF-raised error as `{"error": message}` in all apps.
4. **Dead endpoints**: delete `verify_token`, `check_user` and the duplicate `check-user` route (B2).
5. **Research interests**: one public `GET /api/research-interests` in `authentication`; remove the livestream view and its two routes. It stays public for now; "make research interests authenticated" is recorded in `docs/future-todos.md`.
6. **Passwords**: keep the mirroring and fix `sync_reset_password` (B7). **P1 declined**; recorded in `docs/future-todos.md` as a post-demo option.
7. **Clock skew**: `clock_skew_seconds=60` in the backend token verification, and the frontend "Token used too early" workarounds (F3.2) are deleted.
8. **Failed signup**: delete the newly created Firebase user when backend registration fails (F3.6).
9. **`papers/services.py`**: the four `print` calls become a logger, with the logger definition. This is an approved exception to the phase scope; the roadmap's mention of `papers/views.py` is outdated (it has no prints).
