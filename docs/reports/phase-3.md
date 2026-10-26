# Phase 3 report: Tooling

Branch `phase-3-tooling`, implementing `docs/plans/phase-3-tooling.md` as approved. No production code changed.

## What changed
- `backend/requirements.txt`: UTF-16LE/CRLF to UTF-8/LF; decoded content identical (empty diff against the old file). Supported Python: 3.12.
- `backend/authentication/tests.py`: Selenium class skipped unless `RUN_SELENIUM=1`.
- Test harness: `django_backend/test_runner.py` (network guard raising a `BaseException`, proxy variables cleared, test-only `SECRET_KEY` when none is set), one `TEST_RUNNER` line in `settings.py`, `testsupport/` (`FakeHTTP`, `make_response`, `FakeLiveKit`, `fake_firebase`, `FakeClock`, harness tests), recorded-shape API fixtures.
- 30 pre-registered mutants in `backend/mutations/phase3/` plus `backend/scripts/mutation_check.py` (committed before any characterization test).
- 63 characterization tests: `livestream/tests/` (webhook view and handlers), `papers/tests/` (retry, DOI and Unpaywall enrichment, search view). 82 tests run, 12 skipped (the Selenium class).
- Frontend: `typecheck`, ratcheting `lint` (`scripts/lint-baseline.mjs`, `lint-baseline.json`, inline disables ignored), `lint:full`.
- Docs: "Running the checks" in `docs/testing.md`, parking lot and phase status in `docs/ROADMAP.md`.

## Verification output (fresh clone of the branch, Python 3.12 venv, no `backend/.env`, `SECRET_KEY` unset)
```
$ python manage.py test
Found 82 test(s).
Ran 82 tests in 0.253s
OK (skipped=12)
$ python manage.py test --shuffle 1
Using shuffle seed: 1 (given)
Ran 82 tests in 0.202s
OK (skipped=12)
$ python manage.py test --shuffle 2
Using shuffle seed: 2 (given)
Ran 82 tests in 0.198s
OK (skipped=12)
$ python manage.py makemigrations --check --dry-run
No changes detected
```
```
$ npm ci          added 553 packages
$ npm run lint
Lint matches the baseline: no new findings.
$ npm run typecheck      (tsc --noEmit, exit 0)
$ npm run build          (exit 0; "Compiled successfully", "Generating static pages (14/14)")
```
`npm run build` needs the `NEXT_PUBLIC_*` variables set; this run used placeholder values. Without them Firebase fails while prerendering `/Login`.

## Mutation table (`python scripts/mutation_check.py mutations/phase3`: unmutated run `Ran 82 tests`)
Result: **30/30 killed, 0 survived, 0 stale, 0 invalid, 0 rejected**; tracked files clean afterwards. Status column is the runner's; the test shown is the first one that failed.

| ID | Mutation | First failing test |
|---|---|---|
| M01 | bearer check disabled | `test_missing_authorization_is_rejected_without_side_effects` |
| M02 | room_finished / participant_left dispatch swapped | `test_handler_exception_returns_400_with_error` |
| M03 | invalid JSON returns 200 | `test_invalid_json_returns_400` |
| M04 | room_finished keeps participants | `test_room_goes_inactive_and_only_its_participants_are_deleted` |
| M05 | room_finished leaves room active | same |
| M06 | default role `guest` | `test_new_participant_gets_viewer_role` |
| M07 | `create` instead of `get_or_create` | `test_existing_participant_keeps_their_role` |
| M08 | host check inverted (identity branch) | `test_count_mismatch_with_participants_left_is_not_resynced` |
| M09 | host branch skips `delete_livekit_room()` | `test_host_leaving_by_identity_ends_the_room` |
| M10 | `DeleteRoomRequest(room=participant_identity)` | `test_host_leaving_by_identity_ends_the_room` |
| M11 | `remaining_count <= 1` | `test_count_mismatch_with_participants_left_is_not_resynced` |
| M12 | `room.save()` dropped on empty room | `test_empty_livekit_room_clears_stale_rows_and_ends_the_room` |
| M13 | name fallback removed | `test_known_bug_host_left_deletes_room_twice` |
| M14 | 429 final | `test_429_is_retried_once_after_a_one_second_pause` |
| M15 | `HTTP_ATTEMPTS = 1` | `test_transient_failure_is_not_cached` |
| M16 | `<= 500` | `test_transient_failure_is_not_cached` |
| M17 | no retry sleep | `test_429_is_retried_once_after_a_one_second_pause` |
| M18 | no NOT_FOUND cache on empty items | `test_no_match_sets_no_doi_and_the_miss_is_cached` |
| M19 | NOT_FOUND cached on transient failure | `test_transient_failure_is_not_cached` |
| M20 | no `mailto=` | `test_match_sets_doi_and_asks_crossref_for_one_row_with_contact_email` |
| M21 | `continue` to `break` | `test_malformed_body_does_not_stop_the_other_results` |
| M22 | oa_url / pdf_url swapped | `test_search_calls_serpapi_once_and_enriches_every_result` |
| M23 | `is_oa` default None | `test_missing_is_oa_defaults_to_false` |
| M24 | 404 not cached | `test_unknown_doi_adds_nothing_and_the_miss_is_cached` |
| M25 | rate window `< 0` | `test_known_bug_rate_slot_consumed_on_failure` |
| M26 | rate key not per user | `test_rate_limit_is_per_user` |
| M27 | `num` 10 | `test_search_calls_serpapi_once_and_enriches_every_result` |
| M28 | Unpaywall enrichment removed | `test_search_calls_serpapi_once_and_enriches_every_result` |
| M29 | SerpAPI error returns 200 | `test_known_bug_serpapi_auth_error_returned_as_401` |
| M30 | `AllowAny` | `test_request_without_token_is_unauthorized` |

Equivalent mutants: none found. M12 deserves a note: `room.is_active = False` is still set in memory, so only a DB read (which the test does) can see the missing `save()`.

Sanity checks, each reverted:
- Removing the `FakeHTTP` install from the enrichment base class made the D1 test error with `NetworkAccessBlocked: network access blocked in tests: 'api.crossref.org'`, not pass.
- A patch with a broken import (`enrich_results_with_doi_x`) was reported `invalid  manage.py check fails`.
- A new `const x: any` made `npm run lint` fail (`src/app/layout.tsx  @typescript-eslint/no-explicit-any  0 -> 1`), and still failed with `// eslint-disable-next-line` added; `--update` then refused: `Raised: @typescript-eslint/no-explicit-any 52 -> 53`.

## Prediction log
Every characterization test was predicted from the production code and passed on its first run; no assertion was edited to match an observation. Deviations from the plan:
1. **Lint totals.** Measured 94 errors and 8 warnings in 17 files (102 findings), not 96 errors. The per-rule counts match the plan exactly (52 `no-explicit-any`, 27 `no-unused-vars`, 11 `no-unescaped-entities`, 6 `exhaustive-deps`, 3 `ban-ts-comment`, 2 `no-img-element`, 1 `prefer-const`), and those sum to 94 + 8; the plan's "96" was an arithmetic slip in its summary line. No `eslint-disable` comments exist, so `--no-inline-config` changes nothing today.
2. **Network guard and proxies.** In this environment `HTTPS_PROXY` points at a loopback proxy, so `requests.get('https://example.com/')` connected to the (allowed) proxy and failed as `ProxyError` instead of `NetworkAccessBlocked`. The runner now clears the proxy variables during tests; otherwise a loopback proxy would be a hole in the guard.
3. **`SECRET_KEY`.** As the plan anticipated, view tests failed with an empty key on a clean checkout, so the runner sets a test-only key when `SECRET_KEY` is unset. `settings.py` has no fallback.
4. **`.gitignore` ignores `scripts`.** The two scripts were not tracked until force-added; fixed in their original commits and logged in the parking lot.
5. **`FakeLiveKit` takes a number, not a callable,** for the participant count: ORM calls are not allowed inside the event loop the handlers run it in.

## Known bugs pinned on purpose (`test_known_bug_*`)
| Test | Flips in |
|---|---|
| `test_webhook_view.test_known_bug_accepts_unsigned_bearer_token` (W4) | phase 7 |
| `test_webhook_events.test_known_bug_anonymous_join_raises` and `test_webhook_view.test_known_bug_anonymous_join_returns_400` (J5) | phase 7 |
| `test_webhook_events.test_known_bug_anonymous_participant_not_removed` (L8) | phase 7 |
| `test_webhook_events.test_known_bug_host_left_deletes_room_twice` (L11) | phase 7 |
| `test_search_view.test_known_bug_serpapi_request_has_no_timeout` (S3b) | phase 5 |
| `test_search_view.test_known_bug_serpapi_auth_error_returned_as_401` (S5) | phase 5 |
| `test_search_view.test_known_bug_rate_slot_consumed_on_failure` (S8) | phase 5 |

## Added beyond the plan
Extra tests (more behaviors, nothing dropped): webhook dispatch of `room_finished`, `participant_joined` and `participant_left` through the view; participant-joined cases for a missing room name and unknown room; `test_guard_is_not_an_exception_subclass`; `test_closed_record_has_no_links`; rate limit split into window, boundary (exactly 5s allowed) and per-user tests.

## Proposed `CLAUDE.md` Definition of done (not applied; the user applies it)
```
## Definition of done
- Frontend (`frontend/`): `npm run lint` (baseline ratchet, inline disables ignored) · `npm run typecheck` · `npm run build` (needs the `NEXT_PUBLIC_*` variables from `.env.example`; placeholders are enough)
- Backend (`backend/`, Python 3.12): `python manage.py test` (network blocked; Selenium only with `RUN_SELENIUM=1`) · `python manage.py makemigrations --check --dry-run`
- When changing tested production code: `python scripts/mutation_check.py mutations/<phase>` must report no stale or invalid patches. A changed behavior starts with a failing test.
- All available checks must pass and actually be run.
```
(The line about tooling that "doesn't exist yet" and the Selenium line can then be dropped or shortened.)

## Parking lot additions
See `docs/ROADMAP.md`: Python 3.13 / `psycopg2-binary` (phase 10), the known-bug tests (phases 5 and 7), `hash(title)` DOI cache key (phase 5), no frontend test runner, `.gitignore` swallowing `scripts/`, `print` calls, build env variables.
