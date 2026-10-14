---
name: contract-sync
description: Read-only check that docs/api/*.md matches the real routes, controllers, and frontend types. Use before a PR.
disable-model-invocation: true
---

Compare the contract for: $ARGUMENTS

Do not modify files. Report only.

1. `php artisan route:list --path=api/v1` for the feature's routes: method, URI, middleware.
2. Read the controller and tests: actual request fields, validation rules, response JSON keys, status codes.
3. Read the matching `docs/api/*.md`. List every mismatch: missing endpoint, wrong field name, wrong status code, undocumented error, stale example.
4. Read `frontend/src/types/index.ts` and `src/api/client.ts` for the same endpoints. List type or path drift versus the doc.
5. Output a table: item, doc says, code says, fix. Mark anything you could not check as "unverified".
