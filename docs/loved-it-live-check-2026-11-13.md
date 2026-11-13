# Loved-IT verification — November 13, 2026

Checked from the local Windows development environment. These results distinguish source/tests, backend deployment, frontend publication, and the installed/downloadable Android build; passing local tests does not prove every transaction on a physical phone.

## Live service findings

| Check | Result |
| --- | --- |
| `https://loved-it.shop` | HTTP 200 |
| `https://api.loved-it.shop/up` | HTTP 200 |
| `https://api.loved-it.shop/api/v1/products` | HTTP 200, JSON |
| `https://loved-it.shop/download` | HTTP 200 |
| Public APK | HTTP 200, Android package content type, 65,815,724 bytes |
| Laravel Cloud production | Running; successful deployment of `main` commit `90a0934114a4008664a41e4d0d823a1510b53b76`, completed November 13 at 6:10 p.m. Manila time |
| Public download metadata | Build `26111303`, published November 13; SHA-256 `5de3ec9f74fc8852a96a7c6faf16d5ebfeb94b57d69288fb003eeb35b338d159` |
| Latest mobile source change | `a4906e5`, back-button exit confirmation, committed November 13 at 6:02 p.m. Manila time; the public APK build predates it |
| `https://ws.loved-it.shop` | HTTP 530, response `error code: 1033`; WebSocket handshake failed |
| Production broadcast configuration | `BROADCAST_CONNECTION=log`, no attached Cloud WebSocket application; push updates are disabled |
| Production AI feature flags | `AI_PROVIDER=groq`, support bot and product check enabled |

[Cloudflare documents error 1033](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1033/) as a tunnel connection issue. The web/mobile code has refresh and polling fallbacks, so an unavailable socket does not establish that sending messages through the HTTP API is broken. A live conversation between two accounts was not performed.

The Cloud application root is `backend` and deploys pushes to `main`. This deploys the Laravel API, not `frontend/dist` or an Android APK. The React build and APK need publication to their current hosting separately. The new admin page is on branch `jm/admin-buyer-risk`, in draft PR #54, and is not live.

## Completed validation

- Full backend suite: **905 passed, 11,226 assertions**. It uses the guarded `velure_test` database.
- Flutter analysis: **no issues**.
- Full Flutter suite: **348 passed**, including home back-button confirmation.
- React production build: **passed**, with existing bundle-size/dynamic-import warnings.
- New buyer-risk and Activity Log checks: **10 passed, 75 assertions**; included in the full backend run.
- Real Groq buyer-risk analysis with a synthetic buyer and anonymous aggregate facts: **HTTP 200, valid structured response**. This used the local configured credential; it does not establish production credential health.
- Browser QA at desktop and 390-pixel phone widths using mocked API fixtures: **passed** for rendering, AI response, AI outage, cancellation confirmation, cancellation request, empty search and settled responsive width. No browser page errors. Browser fixtures contain no real buyer records.
- New TypeScript files: Oxlint exited successfully with two warnings about request-loading state updates in effects. New PHP feature files were formatted; `git diff --check` passed.

No live customer transaction was cancelled, account blocked, message sent, or production database changed during verification. The new review feature needs no migration and gives the AI no action tools.

## Release work

The APK publishing helper now correctly reports that it prepares local files. It previously claimed a release was live after only copying files to `frontend/public/download` and `frontend/dist/download`.

A refreshed signed APK is prepared separately from the source PR. Before publication, verify its Android version code and signer against the old APK, upload the APK and matching metadata, and check the public download's SHA-256. Before enabling real-time push, configure an active WebSocket service, the production broadcaster and matching web/mobile connection settings, then test an authenticated private channel between accounts.
