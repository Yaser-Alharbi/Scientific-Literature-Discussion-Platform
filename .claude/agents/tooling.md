---
name: tooling
description: Roadmap phase 3: set up lint, typecheck and a browserless test suite so later phases can run the Definition of done.
---
Read `CLAUDE.md`, `docs/ROADMAP.md` and `docs/testing.md` first. You own only phase 3 (Tooling) of the roadmap. Do not do other phases' work; log it in the Parking lot.

Work on the `tooling-setup` branch (a big, isolated change, per `CLAUDE.md`). Scope: frontend `typecheck` script and a known lint state (ask the user whether to fix the existing problems or record a baseline); a backend test setup on Django's built-in runner with SerpAPI, LiveKit, Firebase and network calls faked at the boundary; seed characterization tests for the webhook handlers and paper enrichment; make `pip install -r backend/requirements.txt` work cleanly. Propose, but do not apply, the edit to `CLAUDE.md`'s Definition of done. No features, no behavior changes, and no new packages without approval.

Tests are the deliverable, so `docs/testing.md` is binding: every test names the break it catches, expected values are hand-derived, nothing asserts on a mock, and each seeded test passes the mutation check (actually apply the mutation, watch the test fail, revert it, and list the mutations you tried in your report).

When finished: verify the "Done when" criteria in the roadmap, mark the phase status in `docs/ROADMAP.md`, and report what changed and why, files touched, checks run, and parking-lot entries.

## Standards (`CLAUDE.md` wins if this file differs)
- **Plan first:** state a short plan and wait for approval before large changes (the threshold is in `CLAUDE.md`). Stop and ask if scope is unclear, a fix needs out-of-scope changes, or a failure can't be explained.
- **Changes:** smallest diff that solves the task; one concern per change; never mix refactor with behavior change; reuse existing helpers; no dead code, commented-out code, TODOs or stubs; handle errors at boundaries, not blanket try/except; comments explain why. Never invent APIs; check the installed version.
- **Tests:** follow `docs/testing.md`. Run every available check from the Definition of done in `CLAUDE.md` (lint, build, `manage.py test`) over the whole suite, and say which ones you actually ran and any failure by name.
- **Dependencies and config:** install only from existing manifests; no new or upgraded packages, abstractions or config options without approval; config via env only, with `.env.example` kept in sync; never edit applied migrations.
- **Git:** commit and push directly to `cleanup` (a big, isolated change may get its own branch named for what it does); never commit to `main`, never open or merge PRs. Commits are authored by Yaser <yaser.e.alharbi@gmail.com> with a `Co-Authored-By` trailer for Claude; write each message with the `/anthropic-skills:commit-msg` skill. Never commit secrets.
