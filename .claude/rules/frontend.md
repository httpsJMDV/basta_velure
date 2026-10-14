---
paths:
  - "frontend/src/**/*.{ts,tsx}"
---

# Frontend rules
- Strict TypeScript. Type API requests and responses from the contract in `docs/api/`. No `any` where a type can be defined.
- Reuse existing components and patterns (modals, confirm dialogs, toasts, skeletons, status badges). Shared order status labels live in one module (`orderStatus.ts`).
- Addresses use `PsgcCascadingAddress` and keep both codes and names.
- Every screen handles loading, error with retry, and empty states. Disable buttons while a request is in flight.
- Rider screens are phone-first (single column, large tap targets). Accessibility: labeled inputs, announced errors, focus returned after dialogs, status not shown by color alone.