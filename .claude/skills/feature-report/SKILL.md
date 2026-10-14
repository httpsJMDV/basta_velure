---
name: feature-report
description: Produce the short end-of-feature report required by CLAUDE.md (files changed, decisions, test output).
---

Write the final report for: $ARGUMENTS

Run first: `git status`, `git diff origin/main --stat`, `php artisan test`, `npm run lint`, `npm run build` (in `backend/` and `frontend/`).

Format, no filler:
- **Files changed**: grouped as backend, frontend, docs, tests, migrations.
- **Decisions**: each non-obvious choice with the reason, and any deviation from the spec.
- **Handoff**: commands teammates must run (migrate, npm install, env keys).
- **Test output**: pass/fail counts per command, copied from real output. If something failed or was skipped, say so first.
- **Not done / follow-ups**: parked items and anything unverified.
