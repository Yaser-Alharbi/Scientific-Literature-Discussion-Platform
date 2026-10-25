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
