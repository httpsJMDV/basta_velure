---
name: new-endpoint
description: Checklist for adding or changing a Laravel API endpoint in this repo (routes, auth, validation, isolation, tests, docs contract).
---

When adding or changing an endpoint for: $ARGUMENTS

1. Find the nearest existing controller and copy its structure, response shape, and error codes.
2. Route goes in the right `auth:sanctum` group in `backend/routes/api.php`: `role:admin`, `approved_sorting_center`, or `approved_rider`.
3. Validate with a FormRequest or the neighbouring pattern. Return 422 with field errors.
4. Isolation: scope every query to the authenticated hub, rider, or seller. Another party's record returns 404, never 403.
5. Status changes on orders go through `OrderStateMachine` only.
6. Multi-step writes use `DB::transaction`; claiming or transitioning rows uses `lockForUpdate()`.
7. Money is `decimal(10,2)`. Do not touch commission, escrow, or payout logic.
8. Emails after commit, inside try/catch.
9. Tests in `backend/tests/Feature`: success, validation, unauthenticated (401), wrong role, wrong account status, cross-account isolation, and the conflict case if any.
10. Update or create `docs/api/<feature>.md` to match the real routes and responses.
11. Run `php artisan route:list --path=<prefix>` and `php artisan test` before reporting.
