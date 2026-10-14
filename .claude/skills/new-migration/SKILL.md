---
name: new-migration
description: Create a safe additive Laravel migration. Use whenever a schema change is needed.
---

Schema change for: $ARGUMENTS

Hard rules: never edit an existing migration, never run `migrate:fresh`, `migrate:refresh`, or `db:wipe`, never touch `backend/database/velure.sql`.

1. Run `php artisan migrate:status` and list `backend/database/migrations` to find the latest timestamp. The new file must sort after it, with no duplicate timestamp.
2. Make it additive: new tables or nullable/defaulted columns. Add a working `down()`.
3. Statuses are strings with constants or enums, not DB ENUM columns. PSGC codes are `VARCHAR(20)` strings. Money is `decimal(10,2)`.
4. Add indexes for columns used in lookups, and foreign keys matching neighbouring tables.
5. Update the model `$fillable`/casts and relationships.
6. Do not run `migrate` unless asked. Instead list the handoff step teammates must run: `php artisan migrate`.
7. Add a test that exercises the new columns or table.
