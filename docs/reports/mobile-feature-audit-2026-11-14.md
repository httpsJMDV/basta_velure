# Loved-IT web-to-mobile feature audit

**Follow-up implementation:** The listed workflow gaps were implemented and published as Android build **26111402** in PR #58. Install the latest app from https://loved-it.shop/download. Buyer shipping/category/reminder controls, rider PDF viewing and the courier/hub native operations described below are now available. See `./.local/artifacts/releases/Loved-IT-release-26111402/README.md` and `./docs/mobile-workflows.md` for the completed release. The audit findings below describe the earlier state. Closed-app push alerts remain the separate enhancement noted at the end; they were not part of the listed workflow implementation.

Checked November 14, 2026, Manila time. This is a read-only comparison of web and Flutter workflows, plus public production checks. No features or production settings were changed during this audit.

## Live status

- https://loved-it.shop returned HTTP 200.
- https://api.loved-it.shop/up returned HTTP 200.
- The browser download-page check passed: it displays Android build **26111401**, links to the versioned APK, and has no page errors. Existing installations need this update for the latest Flutter offer screens.
- Public voucher discovery, shop-voucher and product-voucher checks passed. There is one discoverable shop voucher. The sale filter returned 131 eligible products with a reduced price.
- Unauthenticated rider, hub and courier profile requests returned HTTP 401 as expected. This confirms protection, not successful execution of every signed-in operation.
- Remote main remains `af40f27dec4f57b3f3b6b2ca3dab434c92087027`, the published release's merge commit (PR #57).
- Release validation previously completed: 915 backend tests / 11,315 assertions; 354 Flutter tests; Flutter analyze with no issues; frontend lint/build passed with existing warnings. APK upload/hash/signing and download metadata were verified during publication.
- Latest confirmed scheduler state is OFF, as requested. The registered restart is Sunday November 15 at 8 a.m. Manila. Time-driven jobs are intentionally paused until it restarts. Messaging uses the existing polling fallback.

These checks do not establish that every feature is fault-free on every phone. No new orders, payments, deliveries or customer-account changes were made to test live workflows. GPS with the screen off, camera scanning, physical parcel handovers and signed-in money operations still need a controlled real-device walkthrough with the relevant accounts.

## Highest-value missing mobile workflows

| Priority | Role | Web feature | Current Flutter behavior | Suggested mobile addition |
|---|---|---|---|---|
| 1 | Buyer | Checkout shipping route, actual weight and charged kilograms | Shows delivery fee and serviceability, but the quote model drops route/weight fields | Display the server's route and weight beside the fee; explain that each shop is a separate parcel. This directly addresses confusion about large shipping charges. |
| 1 | Courier logistics | Network-wide return-to-sender assignment and buyer-return pickup management | More → Return to sender opens `/logistics/returns` in the browser | A native return queue, eligible-rider selection, assignment, status and failure history. Hub staff and riders already have their own native return-pickup screens; those do not replace courier-wide control. |
| 2 | Courier logistics | Rider/hub payout processing and seller/courier settlements | Home shows financial totals; most actions open `/logistics/money` | Native payee detail, unpaid-job history, payment reference and confirmation, plus settlement detail. Preserve existing backend rules and audit logging. Truck-driver trip payment is already native and should not be duplicated. |
| 2 | Buyer | Shop-specific categories and subcategories | Shop page lists products; the mobile catalog API has no `store_category_id` filter or shop-category model/UI | A shop category menu and filtered product list using the existing backend filter. |
| 3 | Buyer | Remind me for an upcoming flash sale | Upcoming start time is shown, but there is no reminder action/API call | Enable/disable the existing `/flash-sales/{id}/reminder` feature and show its saved state. Scheduled reminder delivery also depends on the scheduler. |
| 3 | Rider | View uploaded PDF documents | Detects PDFs but tells the rider to use the website; image documents are viewable | An authenticated in-app PDF viewer without saving private documents to the gallery. |
| 3 | Hub staff | Full earnings detail and hub settings | Summary data is available; full Earnings and Settings links open the website | Native earnings/payment history and the small account settings staff actually need on a phone. |
| 3 | Courier logistics | Zones/rates, network coverage, company settings and editable truck-planning parameters | Zones/rates and settings open the web; truck planner is a native summary | Port only frequent phone tasks. Complex rate-table/network editing can remain on desktop; clearly label browser-only actions. |

These are source-confirmed differences, not estimates based on missing route names alone. Some screens open through `Navigator` rather than the router; those were checked too.

## Already present in the buyer app

- Guest browsing, categories/search, product details and variations, wishlist and followed shops.
- Cart, buy-now checkout, addresses, GCash proof and COD, vouchers, sale-product prices and the newly published Home offer previews.
- Orders, cancellation, confirm receipt, buy again, tracking, return/refund requests and return progress.
- Reviews/photos, shop comments, profile/contact changes, buyer ID verification.
- Seller/delivery/support chats, image/product/order attachments, AI customer support and handoff to a person.

The latest voucher fix discovers existing shop offers; it does not create free-shipping vouchers or seller-funded delivery promotions.

## Already present in the rider app

- Rider application, online/offline status, job offers and acceptance/decline.
- Pickup groups, QR verification, pickup confirmation and hub collection scans.
- Delivery stops, directions, buyer contact, proof photos, COD confirmation, failure reasons and returns.
- Buyer-return pickup jobs and collection proof.
- Location sharing with Android foreground-service configuration and a visible location notification. It is not missing in source; background behavior needs a real-phone check.
- COD remittance, earnings/history, GCash details, chat, activity and account/document updates.
- Truck-driver trips and arrival confirmation.
- Native reports with Excel/PDF downloads via the server; the browser saves the generated files.

No major core rider delivery workflow was found absent from Flutter in this audit. Do not rebuild reports, GPS sharing or delivery proof based solely on the web navigation labels.

## Already present for hub and courier staff

Hub staff: dashboard, intake/scanning, sorting, inter-hub transfers, incoming trucks, dispatch batches and rider assignment, failed-delivery handling, return pickups, remote-area counter handover, rider approvals/documents/coverage areas, chat, activity and reports.

Courier staff: network dashboard, hub/rider details and approvals, add rider, parcels and problem views, pickup dispatch/auto-assignment, hub scans, COD/remittance confirmation, truck drivers/trip-pay action, chat, activity and network reports. Financial summary cards exist even though most financial actions remain web-only.

## Browser links and alert limitations

`core/web_links.dart` opens an external website. It does not transfer the app's sign-in token, so an existing browser session or another browser login may be needed. These workflows are accessible, but they are not native screens.

Closed-app push alerts are a separate enhancement, not a confirmed web-to-app omission: this app currently uses in-app polling/realtime listeners and has no Firebase/push-messaging integration in its dependencies. Do not promise job/chat alerts after the app is closed based on foreground polling alone. Keep the previously requested low-cost polling setup unless a separate alert implementation is authorized.

## Source evidence

Paths below are relative to the project root:

- Web routes: `frontend/src/App.tsx`.
- Buyer shipping breakdown: `frontend/src/pages/CheckoutPage.tsx`; compare `mobile/lib/features/buyer/data/checkout.dart` and `checkout/checkout_screen.dart`.
- Shop category filtering: `frontend/src/pages/ShopProfilePage.tsx`; compare `mobile/lib/features/buyer/shop/shop_screen.dart`, `data/catalog.dart` and `data/buyer_api.dart`.
- Flash reminders: `frontend/src/pages/ProductDetailPage.tsx`, `frontend/src/api/client.ts`; compare mobile `product/product_screen.dart` and `data/buyer_api.dart`.
- Courier return management: `frontend/src/pages/logistics/LogisticsReturnsPage.tsx`, `frontend/src/components/logistics/ReturnPickupsPanel.tsx`; compare mobile `features/logistics/courier/courier_more_screen.dart` and `data/logistics_api.dart`.
- Web financial links and native summaries: mobile `features/logistics/courier/courier_home_screen.dart`, `courier_more_screen.dart`, `courier_trucks_screen.dart`, and `hub/hub_more_screen.dart`.
- PDF fallback: `mobile/lib/features/rider/account/account_forms.dart`.
- Existing native reports: `mobile/lib/features/reports/report_screen.dart` and `report_data.dart`.
- Existing foreground GPS: `mobile/lib/features/rider/location/location_beacon.dart`, `mobile/android/app/src/main/AndroidManifest.xml`.

Recommended order: buyer shipping explanation first, courier return assignment second, then native payout/settlement detail. The remaining differences are less urgent for the four-person defense walkthrough.
