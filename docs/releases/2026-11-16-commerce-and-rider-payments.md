# Commerce and rider payments — November 16, 2026

This release adds high-value buyer risk signals, visible Loved-IT voucher discovery, seller-defined product warranties saved with each new purchase, private seller payout receipts, explicit platform GCash refund confirmation, and complete rider payment requests on web and Android.

Riders request their available earned balance from Earnings or Trips on their phone. The home hub and courier share one queue. A staff member takes the request before sending money, records a GCash receipt and reference, and the rider confirms receipt or reports a missing transfer. Exact earnings and trip rows are reserved, one open request is allowed, and the older bulk-pay tools exclude reserved rows. An assignment can only be released by its assignee before transfer, with explicit confirmation that funds have not been sent.

Truck-driver screens show receiving-hub contact details, dispatch ETA, expected pay, return manifest labels and issue reporting. The rider guide reflects these workflows and the actual server pay and limits, with an explicit retry when they cannot load. Web request filters use the shared CustomSelect component.

## Deployment

Laravel Cloud deploys the merged main commit and runs `php artisan migrate --force`. The additive migrations add product/order-item warranty text and the rider payment request ledger and reservation links. Existing paid amounts, commission formulas and saved shipping allocations remain unchanged.

The Cloudflare website and signed Android artifact are published separately from the API. Android release target: **1.0.0, build 26111602**, using the existing release key. Both public download redirects point to immutable versioned bucket objects. Verify the public APK against the SHA-256 in its release metadata before considering the Android download published.

- Website: https://loved-it.shop
- Android download: https://loved-it.shop/download
- Version metadata: https://loved-it.shop/download/version.json

## Validation

- Full local Laravel suite: 977 tests, 11,952 assertions passed.
- Full local Flutter suite: 386 tests passed, including phone request/confirmation flows and guide tests.
- Frontend lint and storefront tests passed; lint retains existing non-blocking warnings.
- New private files, credentials, signing keys, APK binaries and local artifacts are excluded from Git.

Operational instructions are in [SETUP.md](../../SETUP.md) and [setup/mobile.md](../../setup/mobile.md).
