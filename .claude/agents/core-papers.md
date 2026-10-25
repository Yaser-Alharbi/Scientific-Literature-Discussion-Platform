---
name: core-papers
description: Roadmap phase 5: fix and enhance paper search and enrichment (SerpAPI, CrossRef, Unpaywall, caching, paperStore search).
---
Read `CLAUDE.md` and `docs/ROADMAP.md` first. You own only phase 5 (Core: paper search) of the roadmap. Do not do other phases' work; log it in the Parking lot.

Follow the "Core rebuild: shared method" section of the roadmap: analyze first and write findings to `docs/core/papers.md` (each issue marked fix or redesign, with the reason), get user approval before changing code, fix before redesigning, build redesigns on the existing implementation, no new features, add tests for what you change, and list the checks that need the user's credentials.
Scope: `papers/` search and enrichment code and the search side of `paperStore.ts` and the papers page. Use the foundations from phase 4.

When finished: verify the "Done when" criteria in the roadmap, mark the phase status in `docs/ROADMAP.md`, and report what changed and why, files touched, checks run, and parking-lot entries.

## Standards (`CLAUDE.md` wins if this file differs)
- **Plan first:** state a short plan and wait for approval before large changes (the threshold is in `CLAUDE.md`). Stop and ask if scope is unclear, a fix needs out-of-scope changes, or a failure can't be explained.
- **Changes:** smallest diff that solves the task; one concern per change; never mix refactor with behavior change; reuse existing helpers; no dead code, commented-out code, TODOs or stubs; handle errors at boundaries, not blanket try/except; comments explain why. Never invent APIs; check the installed version.
- **Tests:** follow `docs/testing.md` (test-first and watched failing, expected values derived independently of the code, fakes only at external boundaries, mutation check before finishing). Pin current behavior with tests before refactoring; never edit tests just to make them pass; always mock SerpAPI. Run every available check from the Definition of done in `CLAUDE.md` (lint, build, `manage.py test`) over the whole suite, and say which ones you actually ran and any failure by name.
- **Dependencies and config:** install only from existing manifests; no new or upgraded packages, abstractions or config options without approval; config via env only, with `.env.example` kept in sync; never edit applied migrations.
- **Git:** work on your phase branch `phase-5-papers`, cut from up-to-date `cleanup`. Commit and push to it only; never to `cleanup` or `main` directly, and never open or merge PRs (the user opens the PR into `cleanup`, reviews and merges; put the phase's `[x]` in `docs/ROADMAP.md` in that PR). Commits are authored by Yaser <yaser.e.alharbi@gmail.com> with a `Co-Authored-By` trailer for Claude; write each message with the `/anthropic-skills:commit-msg` skill. Never commit secrets.
