# Native buyer, rider and logistics workflows

The Flutter app uses the same permissions, pricing, payment records and state transitions as the website.
The screens below replace the remaining browser links identified in the November 14 mobile audit.

## Buyer

- Checkout displays the server's shipping route, item weight and rounded chargeable kilograms. Shipping is per shop.
- Shop pages show the shop's visible parent categories and subcategories. Selecting one sends `store_category_id`
  to the existing product catalog endpoint; selecting All products clears it.
- An upcoming flash sale supports Remind me / Reminder on through the existing reminder POST/DELETE endpoints.
  Guests sign in first. Sending the scheduled notification requires the scheduler; the UI does not bypass it.

## Rider documents

PDFs fetched through the authenticated document API open in the app. Android's PdfRenderer renders one bounded
page at a time on a worker thread. The document is temporarily held in app-private cache, closed and deleted when
the viewer closes; it is never sent to an external viewer or written to the gallery. Page navigation, zoom,
loading and retry/error states are supported. No PDF package or paid service was added.

## Courier team: More → Manage your network

- **Return to sender:** failed-delivery return queue, failures, parcel history, available rider selection and
  confirmation. A separate Buyer pickups tab uses the existing company-scoped return-pickup API. Parcels still
  travelling between hubs cannot be assigned for the final return leg.
- **Settlements and pay:** unpaid rider/hub balances, GCash details, paginated earning/payment history, and payment
  recording. A 13-digit transfer reference is required. Review and confirmation precede a write. The app never
  submits a computed payout amount and never sends money itself.
- **Weekly shop statements:** COD collected, courier fees, net direction, payment state, receipts, disputes and
  resolutions. The payer can record a transfer or attach a receipt; the receiving courier can confirm or report a
  problem. The current week cannot be paid before it ends. Existing backend rules remain authoritative.
- **Zones and rates:** named-region/province/city coverage selection, exclusions, zone creation/edit/removal, and
  route-rate creation/edit/removal. Each edit is confirmed; the server retains its existing audit log and validates
  ownership. Existing orders keep their recorded shipping charge.
- **Network coverage:** island, region, province and hub drilldowns, counts, and links to existing native hub detail.
- **Truck planning:** capacity and shift settings, route demand and driver recommendations, and future trip pay.
  Already-created trips keep their recorded pay. Existing truck-driver payment screens are reused.
- **Company settings:** personal profile/security, company contact details/logo and GCash payout account. Reviewed
  legal names, SEC/TIN and address cannot be edited through the public contact form.
- **Reports and exports:** continues to use the existing native report screen and authorized server-generated files.

## Hub staff: More → Your hub

- **Earnings:** current unpaid balance, today/week/month/all-time totals and recent paid/unpaid parcel earnings.
- **Settings:** personal profile/security, reviewed hub details and the hub's GCash account.

## API addition

Only read-only courier payout history endpoints were added; see `api/commerce.md`. Every write above calls an
existing endpoint. Company permissions, reference validation, refunds, parcel statuses, commission, rider pay,
shipping prices and settlement calculations were not changed by this release.

## Design and verification

New operations screens reuse the app's brand red, warm gray background, rounded white cards, native choice sheets,
loading/empty/retry states and pull-to-refresh lists. Forms keep their save action visible at the bottom, disable
duplicate submissions and display server validation errors. Payment recording requires review and confirmation.

Verification: 916 backend tests / 11,325 assertions, 367 Flutter tests, Flutter analysis without issues, and frontend
lint/production build with existing warnings. Tests cover category filtering, reminders, payment confirmation and
payloads, return assignment, company and hub edits, delivery-zone edits, truck-planning settings and PDF page/close
messages. Production customer payments and parcel statuses are not mutated for release checks.
