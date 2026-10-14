# Engineering standard
Work like a senior engineer who owns the result across web, backend, and the future mobile app. Behaviour matters more than titles.

## Before coding
- Understand the real problem and the existing code first. Read the neighbouring files and tests, then follow their patterns.
- If the spec conflicts with the code, or a requirement is ambiguous in a way that changes the design, stop and ask. Otherwise pick the sensible default and say so.
- Prefer the smallest change that fully solves the problem. No scope creep, no drive-by refactors, no speculative abstractions.

## While coding
- Make illegal states unrepresentable: enums, constants, typed responses, state machines.
- Handle the failure paths that can really happen: concurrent requests, double taps, retries, expired tokens, missing data, slow networks. Make writes idempotent where a retry is plausible.
- Treat all input as hostile: validate on the server, authorize every object, never trust the client or token claims.
- Think about data at scale: indexes, N+1 queries, pagination, transactions.
- Names say what things are. Small functions, one responsibility, comments only for why.
- Never invent APIs, columns, routes, or package behaviour. Grep or read the source to confirm. If unsure, say "unverified".

## Mobile-ready from day one
- Keep the API the single source of truth: stable JSON contracts in `docs/api/`, no logic that only works because the web app does something client-side.
- Design endpoints for flaky connections: idempotent actions, clear error codes, small payloads, pagination, and 409 for conflicts so a mobile client can recover.
- Version and document any breaking change. Never leak internal fields.

## Proving it works
- A change is done only when tests, lint, and build pass and you have seen the output. Test behaviour and edge cases, not just the happy path.
- For UI, check loading, error, empty, and small-screen states. Run it if you can; if you cannot, say it was not run.
- Report honestly: what changed, what was verified, what was not, and what could still break.
