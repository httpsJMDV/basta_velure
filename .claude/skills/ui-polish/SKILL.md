---
name: ui-polish
description: Design and polish pass for Loved-IT React screens (rider, hub, seller, admin, storefront). Use when building or reviewing any page or component so it matches the app's look and works on phones.
---

Polish the UI for: $ARGUMENTS

Match what the app already does. Read the nearest existing page first and copy its structure. Do not invent a new look.

## Tokens (from `frontend/tailwind.config.js`)
- Brand: `brand-red #C0001A`, `brand-red-dark #8B0013`, `brand-red-light #E8002A`, `brand-black #0D0D0D`, `brand-gray-dark`, `brand-gray-mid`, `brand-gray-soft #F5F5F5`. Font: Inter.
- `bg-brand-wine` is used in a few files but is NOT defined, so its hover does nothing. Use `brand-red-dark` instead and do not add new `brand-wine` uses.
- Statuses: use `utils/orderStatus.ts` (`getStatusLabel`, `getStatusBadgeClass`). Never hand-pick order status colors.

## Which accent where
- Storefront, seller, admin and rider: `brand-red` for primary actions and active states, `brand-black` for secondary. The rider portal copies the seller dashboard: light shell, `RiderUi.tsx` (`PageHero`, `KpiTile`, `SectionCard`, `TabBar`, `StateCard`) and `riderStyles.ts` (`BTN_PRIMARY`, `BTN_SECONDARY`). No blue anywhere in `pages/rider/*`, the rider auth pages or the shared chat view.
- Hub work pages (`HubRidersPage`, `HubIntakePage`): `blue-600` primary actions. `emerald` for success, `amber` for warnings on every portal.
- Hub shell (`HubLayout`): dark `#0B0F19` sidebar with `brand-red` active nav.
- Stay consistent inside one portal. Do not mix red and blue primary buttons on the same screen.

## Layout and shape (counts from the codebase)
- Page wrapper: `space-y-5` or `space-y-6`. Content cards: `bg-white border border-gray-200 rounded-2xl p-4 sm:p-5`, light shadow (`shadow-2xs` or `shadow-sm`). Empty and error panels: `rounded-3xl`, centered, `max-w-lg mx-auto`.
- Inputs and buttons: `rounded-xl`; badges and counters: `rounded-full`. Headings `font-black text-gray-900`; helper text `text-xs text-gray-500`.
- Icons from `lucide-react`, `w-4 h-4` inline, `w-5/6` in tiles, always `aria-hidden="true"` when decorative.
- Reuse `components/ui/*` (Button, Badge, Input, Toast) and existing modals before writing new markup.

## Phone first
- Single column by default; add `sm:`/`lg:` columns after. Check at 360px, 768px and 1280px. No horizontal page scroll.
- Tap targets at least 44px (`min-h-11`, `min-h-12` for primary actions). Sticky bottom action bar for the main action on long phone screens.
- Break long IDs (`break-all` on tracking numbers, `font-mono`), `truncate` or `min-w-0` inside flex rows.
- No hover-only actions. Test with the keyboard.

## States every screen needs
- Loading: skeleton blocks (`animate-pulse`), not a bare spinner.
- Error: `role="alert"`, plain message, a **Try again** button.
- Empty: icon tile, one bold line, one helper sentence, a next action if there is one.
- In flight: disable the button, show a spinner, keep the label.
- Success and failure feedback: color + icon + text together, announced with `aria-live`.

## Accessibility
- Every input has a visible `<label>` bound by `htmlFor`/`id`. Errors are announced.
- Focus ring visible (`focus-visible:ring-2`). Return focus to the trigger after a dialog closes. Dialogs use `role="dialog"`, `aria-modal`, `aria-labelledby`, close on Escape.
- Text contrast at least 4.5:1. Do not use `text-gray-400` for text that matters.
- Tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`.

## Review pass (run on the changed screens)
1. Compare against the nearest existing page: spacing, radius, heading weight, accent color.
2. Walk the five states above and the three widths.
3. Check for color-only meaning, tiny tap targets, unlabeled inputs, and long text overflow.
4. Run `npm run lint` and `npm run build`.
5. If a browser is available (see the `run` skill), start `npm run dev` and look at the page at 360px and 1280px. If you cannot, say "not viewed in a browser" in the report. Never claim a visual check you did not do.

Report: what you changed, which existing page you matched, and anything left unchecked.
