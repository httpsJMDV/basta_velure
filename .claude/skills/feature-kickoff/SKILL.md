---
name: feature-kickoff
description: Start a new feature (e.g. 2.5) safely: sync main, branch, inspect existing code, and report before changing anything.
disable-model-invocation: true
---

Kick off feature: $ARGUMENTS

Do not write code in this skill. Stop at step 5 and wait for approval.

1. `git fetch origin`; confirm the working tree is clean. If not, list the changes and stop.
2. Create `jm/<feature>` from `origin/main` (not local `main`, which may lag).
3. Read the matching sections of `docs/LOVED-IT_PROJECT_PLAN.md`, `docs/ERP-Flow.pdf`, `docs/order-lifecycle.md`, `docs/address-standardization.md`, and any `docs/api/*.md` it touches.
4. Inspect the existing code it builds on: routes in `backend/routes/api.php`, models, `OrderStateMachine`, middleware, frontend pages and `src/api/client.ts`, existing tests. Note reusable patterns.
5. Report: what exists, what is missing, where the spec conflicts with the code, new tables or migrations needed, new dependencies (flag), proposed backend then frontend plan, and open questions. Then stop.
