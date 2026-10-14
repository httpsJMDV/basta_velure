---
name: rider-screen
description: Checklist for building or reviewing a phone-first rider or courier screen in the React frontend.
---

Rider screen: $ARGUMENTS

1. Copy the structure of `frontend/src/pages/rider/RiderPickupsPage.tsx` and the rider layout shell. Reuse modals, confirm dialogs, toasts, skeletons, and status badges.
2. Single column, large tap targets (min 44px), no hover-only actions, usable at 360px width.
3. Types come from `docs/api/*.md`; add them to `src/types/index.ts`. No `any`. Add client methods in `src/api/client.ts`.
4. States: loading skeleton, error with retry, empty state. Disable buttons while a request is in flight and handle 409 conflicts with a clear message and refetch.
5. Never show buyer name, address, phone, or COD amount where the contract forbids it.
6. Accessibility: labelled inputs, announced errors, focus returned after dialogs, status shown by text or icon as well as color.
7. Shared order status labels come from `orderStatus.ts`.
8. Run `npm run lint` and `npm run build`.
