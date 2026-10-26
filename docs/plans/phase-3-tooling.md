# Phase 3 plan: Tooling (lint, typecheck, browserless test suite)

## Context
`docs/ROADMAP.md` (on `cleanup`) phase 3 makes the Definition of done real so phases 4–12 can run the same checks. Measured state on `cleanup` today:
- **Frontend:** `tsc --noEmit` passes. `next lint` reports 96 errors and 8 warnings in 17 files (52 `no-explicit-any`, 27 `no-unused-vars`, 11 `no-unescaped-entities`, 6 `exhaustive-deps`, 3 `ban-ts-comment`, 2 `no-img-element`, 1 `prefer-const`). There are no `eslint-disable` comments. There are three `@ts-ignore` in `authStore.ts`, which `ban-ts-comment` already counts. There is no `typecheck` script.
- **Backend:** `manage.py test` errors out because the Selenium suite in `authentication/tests.py` needs Chrome. `livestream/tests.py` and `papers/tests.py` are empty, so `webhook_events.py` and `papers/services.py` have no tests at all.
- **requirements.txt** is UTF-16LE with CRLF line endings. pip still reads it (checked). It installs cleanly on Python 3.11 and 3.12. On 3.13 it fails because `psycopg2-binary==2.9.9` has no wheel and won't build.

**User decisions (settled):** (1) lint uses a **baseline and ratchet**, with no lint fixes in phase 3; (2) the mutation check is **committed patch files plus a script** that anyone can re-run.

**Core risk this plan addresses:** an agent that writes both the code and the tests can make the tests pass without proving anything. So the plan fixes three things in advance, before any test exists: which behaviors must be pinned, which bugs the tests must catch, and which files may change. All three are checked mechanically.

**Branch order:**
1. This plan document is merged into `cleanup` first.
2. Then `phase-3-tooling` is cut from `cleanup`, so the `tooling` agent can see the plan.
3. No behavior changes and no new packages.

---

## Guardrails (binding for the implementing agent)

1. **The spec is fixed here.** Every behavior ID (W/R/J/L/F/D/U/S below) needs at least one test, and every mutant ID (M01–M30) must be killed. Each behavior states its expected outcome in advance. The agent may add behaviors or mutants, but may not drop or weaken any. If a behavior can't be tested as written, stop and ask.
2. **Mutants come before tests.** Commit the mutation patches and the runner first. At that point the runner only shows that every patch applies and is valid. The real check comes after the tests: 30/30 killed.
3. **Predict, then run.** Write each expected value as a literal, worked out by reading the production code, before running the test. If the run disagrees with the outcome stated in this plan, don't edit the assertion to match. Stop and report "predicted X, observed Y, because Z", and pin Y only after the user confirms.
4. **Production code doesn't change.** `git diff --name-only origin/cleanup...HEAD` may list only the files in the *Allowlist*. Every other path must have zero diff.
5. **Fakes only at boundaries, and they must be real-shaped:**
   - HTTP fakes return real `requests.Response` objects, so `.json()` really parses and really raises on a malformed body.
   - LiveKit fakes return real `livekit.protocol` objects (`ListParticipantsResponse`, `ParticipantInfo`).
   - No bare `MagicMock` for a boundary. Any request the fake has no route for fails with `AssertionError`.
   - A network guard in the test runner blocks every non-loopback connection, in a way production code can't catch (see step 3).
6. **Assert on what's observable:**
   - DB state, and the HTTP status plus body.
   - Outbound requests the fake recorded (host, path, merged query params, kwargs).
   - Caching, measured as the request count on a repeat call.
   - Never cache keys, private helpers, or how a mock was configured.
7. **No escape hatches.** No `skip`, `expectedFailure`, assertions inside `try/except`, conditional assertions, or tests without an assert. The only exception is the Selenium class skip. No `eslint-disable`/`@ts-ignore` workarounds: lint runs with `--no-inline-config`, and `.eslintrc.json` and `tsconfig.json` stay unchanged.
8. **Known bugs are pinned on purpose:**
   - Tests that pin current buggy behavior are named `test_known_bug_*`.
   - Each one gets a docstring naming the roadmap phase that will flip it.
   - The report lists them all, so phases 5 and 7 change them deliberately rather than "fixing a failing test".
9. **Isolation:** clear the cache in `setUp`. The suite must pass under `--shuffle` with two different seeds.
10. **Evidence, not claims:** the report pastes raw output of every verification command. The user, or a fresh agent with no context, re-runs them before merging.

## Allowlist (the only paths phase 3 may touch)
| Path | Allowed change |
|---|---|
| `backend/requirements.txt` | Re-encode to UTF-8/LF only; the decoded content stays identical |
| `backend/authentication/tests.py` | `import os` + class-level `skipUnless(RUN_SELENIUM=='1')` only |
| `backend/django_backend/settings.py` | One line: `TEST_RUNNER = 'django_backend.test_runner.NetworkBlockingRunner'` |
| `backend/django_backend/test_runner.py` | New (matches `test*.py`, so discovery imports it as an empty test module; harmless) |
| `backend/testsupport/**` | New, with `__init__.py` (test-only helpers; not an installed app) |
| `backend/livestream/tests.py`, `backend/papers/tests.py` | Delete the empty stubs and replace each with a `tests/` package (with `__init__.py`) |
| `backend/livestream/tests/**`, `backend/papers/tests/**` | New |
| `backend/mutations/phase3/*.patch`, `backend/scripts/mutation_check.py` | New |
| `frontend/package.json` | `scripts` block only |
| `frontend/scripts/lint-baseline.mjs`, `frontend/lint-baseline.json` | New |
| `docs/testing.md`, `docs/ROADMAP.md` | "Running the checks" section; parking lot entries; phase status |
| `docs/reports/phase-3.md` | New: the phase report (see below) |

**"The report"** means `docs/reports/phase-3.md`, committed last. It holds:
- raw verification output;
- the mutation table;
- the prediction log;
- equivalent-mutant notes;
- the known-bug list;
- the proposed `CLAUDE.md` edit.

The PR description links to it.

---

## Implementation, in commit order (one concern per commit, messages via `/anthropic-skills:commit-msg`)

### 1. Re-encode `backend/requirements.txt` (chore)
Convert UTF-16LE with CRLF to UTF-8 with LF and no BOM. Don't change any pins: pytest and selenium stay, since removing them is already in the roadmap's phase 12 list.

Check: decoding the old file must give exactly the new file:
```
diff <(git show origin/cleanup:backend/requirements.txt | iconv -f UTF-16 -t UTF-8 | tr -d '\r' | sed '1s/^\xEF\xBB\xBF//') backend/requirements.txt
```
The diff must be empty. **Supported Python: 3.12** (3.11 also works). 3.13 goes to the parking lot for phase 10.

### 2. Skip Selenium by default (test)
`authentication/tests.py`: add `@unittest.skipUnless(os.environ.get('RUN_SELENIUM') == '1', 'needs frontend on localhost:4000 and Chrome')` on `FrontendAuthenticationTests`. A class-level skip also stops `setUpClass` from running. Make no other edits; the port 4000 issue belongs to phase 11.

### 3. Test harness (test)
**`django_backend/test_runner.py`**: `NetworkBlockingRunner(DiscoverRunner)`.
- **The guard raises `NetworkAccessBlocked(BaseException)`.** Every path that could reach the network catches `Exception`:
  - the `enrich_*` loops `continue`;
  - `search_scholar` returns 500;
  - `FirebaseAuthentication` returns `None`.

  An `Exception` subclass would be swallowed and the test would pass. A `BaseException` gets past `except Exception`, and unittest still records it as a test error.
- **Patch `socket.getaddrinfo` as well as `socket.socket.connect` and `socket.create_connection`.** All three raise for any non-loopback host or address. DNS runs before `connect`. Without the `getaddrinfo` patch, an offline stray call fails as `requests.ConnectionError`, which `fetch_with_retry` treats as transient and turns into a silent `None`.
- Loopback (`localhost`, `127.0.0.0/8`, `::1`) stays allowed, so `RUN_SELENIUM=1` still works.
- Install the patches in `setup_test_environment` and remove them in `teardown_test_environment`.
- This also protects against a developer's real `backend/.env`, which `load_dotenv()` loads during tests.

**`testsupport/fakes.py`**:
- **`FakeHTTP`** patches `requests.get` exactly **once** per test, with one shared fake. `papers.services.requests` and `papers.views.requests` are the same module object, so stacking two patches would overwrite one global `requests.get` and send every call to the last fake.
  - Routes by host (`serpapi.com`, `api.crossref.org`, `api.unpaywall.org`) to a queue of responses or exceptions (`requests.Timeout`, `requests.ConnectionError`).
  - Records each call as `(host, path, query, kwargs)`. `query` merges the URL's query string (CrossRef and Unpaywall build it into the URL) with `params=` (SerpAPI passes params separately); `kwargs` keeps `timeout` and anything else.
  - Fails on any unrouted host or an empty queue.
- **`make_response(status, json_body | raw_bytes)`** builds a real `requests.Response`.
- **`FakeLiveKit`** is an async context manager, returned by a patched `livestream.webhook_events.get_livekit_client`.
  - Its `.room` has only `list_participants` and `delete_room`.
  - It returns real protos and records the request protos.
  - It can be told to raise.
- **Drift guard:** a test asserts that every public method on the fake exists on the installed `livekit.api.room_service.RoomService`.

**`testsupport/auth.py`**:
- Patches `authentication.authentication.auth.verify_id_token`, the Firebase boundary. It returns `{'uid': …}` for a known token and raises `ValueError` otherwise.
- Every API test uses it, the webhook tests included: DRF authenticates every request, and the webhook tests send `Bearer …`. Results then don't depend on whether a developer's `.env` set up Firebase.
- View tests go through our real `FirebaseAuthentication`, not DRF's `force_authenticate`.

**`testsupport/clock.py`**:
- Patches the `time` name inside each target module (`papers.views.time`, `papers.services.time`) with a fake that has `time()` and `sleep()`. Never patch global `time.time`, which Django's in-memory cache also uses for expiry.
- The clock starts at `1_700_000_000.0`, not 0. `search_scholar` checks `if last_request_time and …`, and `0.0` is falsy, so a clock starting at 0 would turn the rate limit off.
- Sleeps are recorded and advance the clock.

**`testsupport/test_harness.py`**:
- A real `requests.get('https://example.com/')` (a hostname, so DNS runs) raises exactly `NetworkAccessBlocked`.
- A raw `socket.create_connection(('93.184.216.34', 443))` raises `NetworkAccessBlocked`.
- `FakeHTTP` raises on an unrouted host.
- `FakeHTTP` merges URL query and `params=` into one dict.
- The LiveKit drift guard.

**Fixtures** (`papers/tests/fixtures/*.json`): full documented response shapes, with no live SerpAPI calls since SerpAPI is paid.
- SerpAPI `google_scholar`: `search_metadata`, `search_parameters`, `organic_results` (with `title`, `link`, `publication_info`, `resources`, `inline_links`).
- CrossRef `/works`: `status`, `message-type`, `message.items[]`.
- Unpaywall v2 object: `best_oa_location`, `is_oa`, `oa_status`, `journal_name`, `year`, `publisher`.

**Clean checkout:** run `manage.py test` with no `backend/.env` and `SECRET_KEY` unset. Only if a test then fails on an empty `SECRET_KEY`, have the runner set a test-only key when the setting is empty. Never put a fallback in `settings.py`.

### 4. Pre-registered mutants and runner (test), before any characterization test
**`backend/scripts/mutation_check.py`** uses only the standard library. Usage: `python scripts/mutation_check.py mutations/phase3`.

Before any patch:
- Refuse to run if tracked files are dirty (`git status --porcelain --untracked-files=no`), so an untracked venv doesn't block the run.
- Run the suite unmutated. It must pass; record "Ran N tests".

For each patch:
1. `git apply --check`. A patch that doesn't apply is **stale**, an error, never a kill.
2. Reject patches that touch any `test*` path, `testsupport/`, `scripts/` or `mutations/`.
3. Apply the patch. Inside `try/finally` (revert with `git apply -R`, even on Ctrl-C):
   - **Validity gate:** `python -m py_compile` on every patched file, then `manage.py check`. If either fails, the mutant is **invalid**, not killed. A patch that breaks importing `views.py` or the URLconf would otherwise still print "Ran N tests" and fail every test.
   - Run `manage.py test`. The mutant is **killed** only if the run fails and still ran N tests.

After all patches:
- Print a table of ID, status, and the first failing test name.
- Exit non-zero on any survived, stale or invalid mutant.
- Finally, confirm tracked files are clean.

**Authoring patches:** make a real edit in the work tree, then `git diff -- <file> > mutations/phase3/Mxx-<slug>.patch`, then `git checkout -- <file>`. Never write a patch by hand. Each mutant is one patch file:

| ID | File | Mutation |
|---|---|---|
| M01 | livestream/views.py `webhook` | Bearer check disabled (`if False:`) |
| M02 | 〃 | `room_finished` ↔ `participant_left` dispatch swapped |
| M03 | 〃 | Invalid JSON returns 200 |
| M04 | webhook_events `handle_room_finished` | Drop `Participant…delete()` |
| M05 | 〃 | `is_active = False` → `True` |
| M06 | `handle_participant_joined` | Default role `'viewer'` → `'guest'` |
| M07 | 〃 | `get_or_create` → `create` (fails loudly in J2 via `unique_together`) |
| M08 | `handle_participant_left` | Host check `==` → `!=` (identity branch) |
| M09 | 〃 | Remove `delete_livekit_room()` call in host branch (identity) |
| M10 | 〃 | `DeleteRoomRequest(room=room_name)` → `room=participant_identity` |
| M11 | 〃 | `remaining_count == 0` → `<= 1` |
| M12 | 〃 | Drop `room.save()` in zero-remaining branch |
| M13 | 〃 | Name-fallback block removed |
| M14 | papers/services `fetch_with_retry` | 429 treated as final |
| M15 | 〃 | `HTTP_ATTEMPTS = 1` |
| M16 | 〃 | `< 500` → `<= 500` |
| M17 | 〃 | Drop `time.sleep(HTTP_RETRY_DELAY)` |
| M18 | `enrich_results_with_doi` | No `NOT_FOUND` cache on empty items |
| M19 | 〃 | Cache `NOT_FOUND` on transient (`None`) path |
| M20 | 〃 | Drop `mailto=` from CrossRef URL |
| M21 | 〃 | `continue` in `except` → `break` |
| M22 | `enrich_results_with_unpaywall` | `oa_url`/`pdf_url` swapped |
| M23 | 〃 | `is_oa` default `False` → `None` |
| M24 | 〃 | 404 branch caches nothing |
| M25 | papers/views `search_scholar` | Rate window `< 5` → `< 0` |
| M26 | 〃 | Rate-limit key not per user |
| M27 | 〃 | `"num": 20` → `10` |
| M28 | 〃 | Unpaywall enrichment call removed |
| M29 | 〃 | SerpAPI non-200 returns status 200 |
| M30 | 〃 | `IsAuthenticated` → `AllowAny` |

At this commit, the runner must report 30 valid patches, 0 stale and 0 invalid. Survivors are expected, since no tests exist yet. All 30 have been checked to be non-equivalent. If the agent adds a mutant that turns out to be equivalent, it documents it in the report and never "kills" it by asserting on internals.

### 5–7. Characterization tests (test), each commit test-only
Expected values are hand-derived literals. Prediction notes go in the report, not the test files.

LiveKit tokens set `name = user.username` for signed-in users (`livestream/views.py` `get_room_token`). Anonymous users get identity `anonymous-<uuid>`, plus a temp user whose `username` is that identity. The fixtures below spell out `identity` and `name` for each case.

**`livestream/tests/test_webhook_view.py`**: POST JSON to `/api/livestream/webhook/`. DB rows are built by `User`/`Room`/`Participant` ORM calls. Every test fakes **both Firebase and `FakeLiveKit`**, since W4 and M02's swapped dispatch would otherwise reach the real `get_livekit_client`.
- **W1:** GET returns 200 with `success: true`.
- **W2:** no `Authorization` header returns 401, with no DB change.
- **W3:** `Authorization: Basic x` returns 401.
- **W4** `test_known_bug_accepts_unsigned_bearer_token`: `Bearer anything` plus `room_finished` returns 200 and deactivates the room (phase 7).
- **W5:** an invalid JSON body returns 400.
- **W6:** an unknown event returns 200, with no DB change.
- **W7:** a handler exception (`list_participants` raises during `participant_left`) returns 400 with an `error` key.

**`livestream/tests/test_webhook_events.py`**: call the handlers directly, with LiveKit faked.
- **R1:** the room goes inactive and only *its* participants are deleted; another room's rows are untouched.
- **R2:** unknown room → no exception, no change.
- **J1:** known room + `identity=str(user.id)` → Participant with role `viewer`.
- **J2:** an existing `guest` row keeps `guest`.
- **J3:** unknown user id or unknown room → no row.
- **J4:** missing identity or room name → no change.
- **J5** `test_known_bug_anonymous_join_raises`: `identity='anonymous-…'`. `User.id` is a `BigAutoField`, so `get(id='anonymous-…')` raises `ValueError`, not `DoesNotExist`.
  - Calling the handler directly raises `ValueError`.
  - Through the view, the response is 400 (phase 7).

**`handle_participant_left` (L1–L11).** Default LiveKit fake: `list_participants` returns as many participants as the DB has afterwards, so no resync happens unless a case says otherwise.
- **L1:** a non-host leaves (`name` = their username). Only their row is deleted, the room stays active, and there are zero `delete_room` calls.
- **L2:** the host has a Participant row and leaves with `identity=str(host.id)`, `name='Host Display'` (not a username). The room goes inactive, all rows are deleted, and there is exactly one `delete_room`, with `room == room_id`.
- **L3a:** the host has *no* Participant row; `identity=str(host.id)`, `name=host.username`. The identity branch skips the host path because `participant_found` is False. The name branch runs it: the room goes inactive and there is exactly one `delete_room`.
- **L3b:** the host has no Participant row; `identity=str(host.id)` and `name` is absent (defaults to `'Unknown'`). The room stays active and no host-path `delete_room` runs. The fake reports a count equal to the DB's, so the resync path makes no call either.
- **L4:** someone leaves while LiveKit reports 0 remaining and stale DB rows exist. The rows are cleared, the room goes inactive, and there is one `delete_room`.
- **L5:** LiveKit reports k>0 and that doesn't match the DB. Nothing is resynced beyond removing the leaver.
- **L6:** `delete_room` raises (L2 setup). The DB changes are kept and the handler doesn't raise.
- **L7:** `list_participants` raises. The exception propagates, and the earlier DB deletes stay.
- **L8** `test_known_bug_anonymous_participant_not_removed` (phase 7): the `int` lookup raises `ValueError` and the outer `except` swallows it. The anonymous fallback never runs, so the row remains.
- **L9:** unknown room → no LiveKit calls.
- **L10:** the identity is a non-existent numeric id, but `name` matches a non-host username. That user's row is deleted.
- **L11** `test_known_bug_host_left_deletes_room_twice` (phase 7): the real token shape, `identity=str(host.id)` and `name=host.username`, with the host's Participant row present. The identity branch and the name branch both run the host path, so there are exactly two `delete_room` calls with `room == room_id`. This is the normal production path when a host leaves.

**`papers/tests/test_enrichment.py`**: `FakeHTTP` plus the fake clock, with the cache cleared in `setUp`. Settings come from `override_settings` with literal emails, and assertions use those same literals.

`fetch_with_retry` (F1–F5):
- **F1:** 200 → 1 request, 0 sleeps, `timeout=5`.
- **F2:** 429 then 200 → 2 requests, sleeps `[1.0]`.
- **F3:** 500, 500 → `None`.
- **F4:** `Timeout` then `ConnectionError` → `None`.
- **F5:** 404 → returned after 1 request.

`enrich_results_with_doi` (D1–D7):
- **D1:** a CrossRef match sets `result['doi']` to the fixture literal. The request has host `api.crossref.org`, `query.title=<title>`, `rows=1` and `mailto=<literal>`.
- **D2:** a repeat call with the same title makes 0 new requests, and the DOI is still set.
- **D3:** empty `items` → no DOI; a repeat makes 0 requests.
- **D4:** a transient failure → no DOI; a repeat requests again.
- **D5:** a 400 → no DOI, and nothing is cached.
- **D6:** a malformed body on result 1 still lets result 2 be enriched.
- **D7:** distinct titles are each looked up.

`enrich_results_with_unpaywall` (U1–U7):
- **U1:** no DOI → 0 requests.
- **U2:** 200 → `result['unpaywall']` equals the full 7-key literal dict.
- **U3:** no `best_oa_location` and no `is_oa` → `oa_url` and `pdf_url` are `None`, and `is_oa` is `False`.
- **U4:** a cached repeat makes 0 requests.
- **U5:** 404 → no key; a repeat makes 0 requests.
- **U6:** 500, 500 → no key; a repeat requests again.
- **U7:** the URL path holds the DOI, and the query has `email=<literal>`.

**`papers/tests/test_search_view.py`**: GET `/api/papers/search/` with `Authorization: Bearer <tok>`, Firebase faked.
- **S1:** no token returns 401.
- **S2:** a missing `query` returns 400, with zero SerpAPI requests.
- **S3:** success.
  - Exactly one SerpAPI request, whose merged query has `engine=google_scholar`, `q=<query>`, `num=20` and `api_key=<override literal>`.
  - The response's `organic_results` carry `doi` and `unpaywall` from the fixtures.
- **S3b** `test_known_bug_serpapi_request_has_no_timeout` (phase 5): the recorded SerpAPI kwargs have no `timeout`.
- **S4:** rate limit, with the clock starting at its non-zero value.
  - The same user within 5s gets 429, with no new request.
  - At 5s or later, the request is allowed.
  - Another user is unaffected.
- **S5** `test_known_bug_serpapi_auth_error_returned_as_401` (phase 5): SerpAPI 401 with `{"error": "Invalid API key."}` returns our 401 with that message. The frontend can mistake that for the user's session failing.
- **S6:** no `organic_results` → the body passes through unchanged, with zero CrossRef/Unpaywall requests.
- **S7:** a `requests.ConnectionError` from the SerpAPI fake returns 500.
- **S8** `test_known_bug_rate_slot_consumed_on_failure` (phase 5): a failed SerpAPI call still blocks a retry within 5s.

After this step, `mutation_check.py mutations/phase3` must report 30/30 killed, 0 stale, 0 invalid.

### 8. Frontend tooling (build)
**`package.json` scripts:**
- `"typecheck": "tsc --noEmit"`
- `"lint": "node scripts/lint-baseline.mjs"`
- `"lint:full": "next lint --no-inline-config"`

**`scripts/lint-baseline.mjs`** uses Node's standard library only:
- Run `next lint --no-inline-config -f json -o <tmpfile>` (temp file from `os.tmpdir()`).
  - `next lint` exits non-zero while the baseline errors exist, so ignore its exit code and stdout and parse the file.
  - If the file is missing or isn't valid JSON, fail.
- Key each finding by (path, ruleId). Paths are relative to `frontend/` and normalized to `/`, so a baseline generated on Linux matches on Windows.
- Compare the counts against `lint-baseline.json`. Fail on:
  - any count above the baseline;
  - any new (path, rule) pair;
  - any fatal parse error (`ruleId: null`).
- Print the pairs that improved.
- `--update` rewrites the baseline but refuses to raise any per-rule total.

Generate the committed baseline with `--no-inline-config` from today's code. Report the measured totals. The expectation is 96 errors and 8 warnings, since there are no existing `eslint-disable` comments; explain any difference.

### 9. Docs (docs)
- **`docs/testing.md`:** add a "Running the checks" section covering:
  - Python 3.12, and the commands below.
  - The network guard and why it raises a `BaseException`; `RUN_SELENIUM=1`.
  - The mutation runner: how later phases add `mutations/<phase>/`, how patches are authored with `git diff`, and how to retire a stale patch, with a written reason, when a phase deliberately changes behavior.
- **`docs/ROADMAP.md` parking lot:**
  - Python 3.13 / `psycopg2-binary` (phase 10).
  - Every `test_known_bug_*` with its phase: W4, J5, L8, L11 (phase 7); S3b, S5, S8 (phase 5).
  - The DOI cache key uses `hash(title)`. Python randomizes `hash` per process, so with a shared cache across workers the DOI cache never hits (phase 5).
  - A frontend test runner is not added: no core phase needs one yet, and a new package needs approval.
- Mark phase 3 status.
- **Proposed** `CLAUDE.md` Definition of done, given in the report only for the user to apply:
  - Frontend: `npm run lint` (baseline ratchet, inline disables ignored) · `npm run typecheck` · `npm run build`
  - Backend (Python 3.12): `python manage.py test` (network blocked; Selenium only with `RUN_SELENIUM=1`) · `python manage.py makemigrations --check --dry-run`
  - When changing tested production code: `python scripts/mutation_check.py mutations/<phase>` must report no stale or invalid patches. A changed behavior starts with a failing test.

---

## Verification (all run from a fresh clone; raw output goes in the report)
```bash
# backend, Python 3.12 venv, no backend/.env
pip install -r backend/requirements.txt
cd backend && python manage.py test                       # passes; Selenium reported as skipped
python manage.py test --shuffle 1 && python manage.py test --shuffle 2
python manage.py makemigrations --check --dry-run
python scripts/mutation_check.py mutations/phase3         # 30/30 killed, 0 stale, 0 invalid
cd ../frontend && npm ci && npm run lint && npm run typecheck && npm run build
# guardrail audits
git diff --name-only origin/cleanup...HEAD                # ⊆ allowlist
git diff origin/cleanup...HEAD -- backend/django_backend/settings.py backend/authentication/tests.py frontend/package.json   # only the allowed lines
grep -rnE "@(unittest\.)?(skip|expectedFailure)|skipTest\(|SkipTest" backend --include='test*.py'   # only the Selenium class
grep -rn "MagicMock" backend/*/tests backend/testsupport        # none at boundaries
```
**Sanity checks** (each one is reverted afterwards):
- Add `const x: any = 1` to one file: `npm run lint` must fail, and must still fail with `// eslint-disable-next-line` added.
- Temporarily remove the `FakeHTTP` patch from D1: the test must error with `NetworkAccessBlocked`, not pass or fail as "no DOI".
- Add a patch that breaks a view's import: the runner must report it as **invalid**.

Done when every command above passes and the report includes:
- the mutation table showing 30/30 killed;
- the prediction log;
- the known-bug list;
- the proposed `CLAUDE.md` edit.

