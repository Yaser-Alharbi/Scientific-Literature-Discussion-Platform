# Testing rules

For anyone writing or changing tests, including every agent. Adapted from the test-driven-development skill in obra/superpowers. `CLAUDE.md` wins if the two differ.

## Why these rules exist
Tests must catch real breaks. An agent that can read the tests and write code that merely satisfies them has proven nothing, so tests have to be written first, derived independently of the code, and checked for whether they can actually fail.

## The cycle
1. **Red:** write one test for one behavior (a bug fix or a new requirement). Run it and confirm it fails for the expected reason, not a typo or an import error.
2. **Green:** write the smallest code that passes. Add nothing the test doesn't ask for.
3. **Refactor:** clean up with tests green. No new behavior.
4. A test that passes the first time proves nothing. Fix the test.
5. **Refactors of existing code** have no failing test to start from. Write *characterization tests* that pin what the code does today, and run them against the unchanged code first (green). Then change the code. A characterization test that couldn't fail under a plausible change is worthless (see the mutation check).
6. Never write the production change first and add tests afterward. If that happened, discard the production change and redo it from the test.

## What a good test looks like
- **Names the break:** before writing it, state which production change should make it fail, and whether that change is a bug or a decision. If you can't name one, the test is wrong.
- **Expected values are hand-derived literals.** Never compute the expected value with the code under test or its helpers (a mirror assertion is always true).
- **Tests behavior, not text or constants.** No asserting that a file contains a line, that a constant has a value, or that a removed name stays removed.
- **Tests our code, not the framework.** Test the routes, queries, payloads and decisions we wrote, not Django, DRF or Next.js internals. Trivial getters and forwarding need no test.
- **Real code over mocks.** Fake only external boundaries: SerpAPI, CrossRef, Unpaywall, LiveKit, Firebase and the network. Never assert on the mock itself. Learn the real method's side effects before faking it.
- **Fakes are specific and complete:** one fixture per branch (success, 4xx/5xx, timeout, malformed body), mirroring the full real response shape, with call counts and arguments asserted where they are part of the contract.
- **Production code carries production methods only.** Helpers that only tests use live in test utilities.
- One behavior per test, a clear name.

## Never game the tests
- Never edit a test just to make it pass. If a test is wrong, say so in the report, with the reason, and show the old and new version.
- Don't read the tests to decide how to special-case the code. The code should satisfy the requirement, which the test only checks.
- Report every failing test by name, including ones you didn't cause. Say which checks you actually ran.

## The mutation check (before finishing)
For each test you wrote, mentally (or actually) apply realistic bugs to the production code: wrong constant or argument, wrong branch, missing side effect, empty return, missing validation for empty/zero/malformed/unauthorized input. At least one test must fail for each. Revert any real mutation afterward. A mutation nothing catches means the behavior is unprotected or the test is tautological.

## Project specifics
- SerpAPI is paid: always fake it. Firebase, LiveKit and network calls are faked at the boundary.
- Backend: Django's test runner (`python manage.py test`) on SQLite, no browser. The Selenium suite in `authentication/tests.py` is optional.
- Run the whole project suite before calling anything done, not just the new test file, and name any failure.

## Running the checks
Backend (Python 3.12; 3.11 also works; 3.13 does not, see the parking lot), from `backend/`, in a venv with `pip install -r requirements.txt`:
- `python manage.py test` runs the browserless suite on SQLite. It needs no `.env` and no `SECRET_KEY`; the runner supplies a test-only key. The Selenium class in `authentication/tests.py` is skipped unless `RUN_SELENIUM=1` (it also needs the frontend on `localhost:4000` and Chrome).
- `python manage.py test --shuffle 1` (any seed) must also pass: tests may not depend on each other or on a warm cache.
- `python manage.py makemigrations --check --dry-run` must report no changes.
- `python scripts/mutation_check.py` must report every patch killed. It runs the patches of every phase, not just the current one.

Frontend, from `frontend/` after `npm ci`:
- `npm run lint` is a ratchet: it fails on any finding beyond `lint-baseline.json` (keyed by file and rule) and ignores `eslint-disable` comments. `npm run lint:full` prints the raw report. After fixing findings, `node scripts/lint-baseline.mjs --update` lowers the baseline; it refuses to raise it.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` needs the `NEXT_PUBLIC_*` variables from `.env.example` set (placeholder values are enough for a build), otherwise Firebase fails while prerendering `/Login`.

### The network guard
`django_backend.test_runner.NetworkBlockingRunner` blocks every non-loopback DNS lookup and connection while tests run, and clears proxy variables so a loopback proxy cannot be used to get out. It raises `NetworkAccessBlocked`, a `BaseException` on purpose: production code catches `Exception` around its third-party calls (the `enrich_*` loops, `search_scholar`, `FirebaseAuthentication`), and an ordinary exception would be swallowed and leave the test green. A test that reaches the network therefore errors with that name; fix it by faking the boundary with `testsupport/` (`FakeHTTP`, `FakeLiveKit`, `fake_firebase`, `FakeClock`), never by catching the error.

### The mutation runner
`mutations/<phase>/*.patch` are one-line production-code bugs written before the tests that must catch them. The runner applies each one in turn, runs the suite and reverts it. A mutant counts as killed only if the suite fails and still runs the same number of tests. A patch that no longer applies is stale; one that does not compile or fails `manage.py check` is invalid; neither counts as a kill, and either fails the run.
- To add a mutant, make the edit in the work tree, run `git diff -- <file> > mutations/<phase>/Mxx-<slug>.patch`, then `git checkout -- <file>`. Never write a patch by hand. Patches may not touch tests, `testsupport/`, `scripts/` or `mutations/`.
- A patch that goes stale because a refactor moved or reworded the code around it is re-created: put the same bug into the new code, save it with `git diff` under the same file name, and revert. Never delete it; the behavior still needs protecting.
- A phase that deliberately changes tested behavior first flips the relevant `test_known_bug_*` test, then retires the patches that no longer apply: delete the patch in the same commit and give the reason in the commit message and the phase report. Never edit a patch to make it apply without re-checking that it is still a real bug.
- A mutant that turns out to be equivalent (no test can tell it apart) is documented in the phase report, never killed by asserting on internals.

