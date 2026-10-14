---
name: audit
description: Read-only post-implementation audit of the current branch. Use after finishing a feature, before pushing or opening a PR.
disable-model-invocation: true
---

Audit the work on the current branch for: $ARGUMENTS

Do not modify any file. Report only, with file and line evidence. If you cannot verify something, say "unverified".

Check:
1. Git hygiene: `git status` is clean; `git diff main --stat` shows only files that belong to this feature; no stray files; `velure.sql` and old migrations untouched.
2. Migrations: additive, working `down()`, applied (`php artisan migrate:status`). List the handoff steps teammates must run.
3. Hardcoded values: localhost, URLs, emails, placeholder text, debug leftovers. New env keys are documented.
4. Auth: `php artisan route:list` for the new routes; role middleware, object-level isolation, private file access, validation, mass assignment.
5. Status consistency: every place this feature's statuses are checked (login gating, guards, frontend types, badges).
6. Contract: `docs/api/*.md` matches the real routes and responses.
7. Tests: run the full suite, review the new tests for real assertions and missing paths, run lint and build.
8. Quality: existing patterns followed, N+1 queries, scope creep.

Output: Verdict (PASS / PASS WITH FIXES / FAIL), Blockers, Should fix, Handoff steps, Verified OK, Unverified. Each blocker gets file:line, evidence, and a proposed fix.