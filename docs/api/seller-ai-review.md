# Manual seller AI review

`POST /api/v1/admin/seller-applications/{sellerProfile}/ai-review` requires an authenticated admin and is limited to 10 requests/minute. Only pending applications from email-verified accounts are eligible (otherwise 409).

The admin explicitly presses **Run AI review** in the seller application modal. Registration and viewing applications never trigger this service. It cannot approve/reject an application, change roles, edit documents, or take other actions. Existing manual decisions continue to work during AI outages.

The existing AI provider (Groq) receives only an allowlisted seller type and boolean field/upload-presence indicators. No names, applicant-written text, document images/paths, TIN/ID numbers, dates of birth, contact details, addresses or payout information are included. Presence does not validate a document or its contents. Business registration and BIR 2303 are required for sole proprietorship/corporation; the other extra documents remain optional under the current registration rules.

Success: `{data: {summary, checks: string[], facts, generated_at, provider}}`. `facts` contains boolean completeness indicators and the seller type; `checks` contains 1–4 suggested manual checks. Responses are reused for up to five minutes for identical facts/provider/model. Changes to completeness invalidate that cache; concurrent decisions or changed facts return 409. Successful requests create `seller_application.ai_reviewed` audit entries containing provider/time only. No AI decision is saved to the application.

Malformed/refused/unavailable model responses return 503 with a generic message. Provider exceptions and credentials are not returned or logged by this endpoint.

## Shared support-chat protections

Web and Flutter use the same support-chat backend. User-controlled names are excluded from the system prompt. Conversation text and tool results are untrusted data. Tool dispatch validates argument types and allowlisted keys, scopes all order queries to the conversation owner, and exposes only order lookup and human handoff. The model has no cancellation, refund, address-change or seller-approval tool. Provider failure logs contain exception class, not the raw provider error. These boundaries limit impact; prompt instructions cannot guarantee that every model-generated sentence resists manipulation.
