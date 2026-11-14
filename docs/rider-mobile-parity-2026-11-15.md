# Rider web / Android verification — November 15, 2026

The rider operates primarily in Flutter; the website remains a backup. This audit compares user actions and API calls, rather than requiring identical layouts.

| Web function | Android location / implementation |
| --- | --- |
| Online/offline, availability, job counts | Home, `rider_api.dart` status/availability |
| Timed offers, accept/decline | Offer overlay, pickup screen; same offer APIs |
| Seller pickup list, accept/release, verify tracking, physical collection | Pickups, scanner/manual entry, handover checklist |
| Delivery list, start trip, scans, route/journey | Deliveries, collect screen, route map and parcel journey |
| Buyer call/text and logged contact | Delivery sheets and rider API contact |
| Delivery proof photo, exact COD, success/failure reason and note | Delivered and failed sheets; server validates outcomes |
| Return to sender, shop messaging, hand-back | Returns screen and parcel chat |
| Buyer return collection photo, missed visit, hub drop-off, final shop leg | Return pickups screen / shared return API |
| COD balance, remittance, reference and pending history | COD screen |
| Earnings day/week/month/year, adjacent periods, breakdown and paid/unpaid jobs | Earnings screen |
| Delivery history outcomes, tracking/order search, date range, pagination | Earnings → History. Search/date controls added in this change |
| Parcel messages, unread counts and read markers | Rider chat; polling fallback |
| Vehicle/plate OR-CR update, license renewal, verification status | Account forms |
| Submitted private documents | Account document viewer (including native PDF support) |
| GCash account | Account / earnings GCash form |
| Reports over 7/30/90 days, PDF and Excel | Account → Reports |
| Activity categories, search, older entries | Shared Activity screen, rider scope |
| Truck driver trips and arrival | Trips screen; duty-specific navigation |
| Notifications, sign out | Notification screen and Account |

No additional rider business action was found only on the web after adding history filters. Automated Flutter route/screen tests and backend authorization tests cover these workflows. This is source and automated verification; it does not claim a physical field delivery, GPS reception, camera permission, or payment transaction on every handset. Push notifications while the app is closed and managed WebSockets remain outside the current deployment; existing foreground polling is retained.

Hub and courier pickup controls are available on both platforms under **Pickup control**. Ordinary buyers and sellers retain shopping; rider, hub and courier accounts receive no buyer switch.
