---
paths:
  - "backend/**/*.php"
---

# Backend rules
- Route groups sit behind `auth:sanctum`: admin uses `role:admin`, hub routes use `approved_sorting_center`, rider routes use `approved_rider`.
- Errors: validation returns 422 with field-level errors. State conflicts use the same response as neighbouring endpoints. Another hub's or rider's record returns 404, never 403.
- Check account status in the database on every request. Never trust token claims.
- Wrap multi-step writes in `DB::transaction`, and use `lockForUpdate()` when claiming or transitioning rows.
- Send emails after commit inside try/catch. A mail failure must never roll back the action. Build email text from real model data and generate links from config, never a hardcoded localhost.
- Store money as `decimal(10,2)`, never float. Store statuses as strings with constants or enums, not database ENUM columns.
- Every new endpoint gets feature tests (success, validation, authorization, isolation) and an entry in `docs/api/`.