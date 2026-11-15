# Admin buyer classification and commission chart

The dashboard's buyer total, new-buyer figures and `/admin/users?role=buyer` directory count buyer-only accounts. A stored `users.role=buyer` is not sufficient: pending/approved rider, hub and courier identities are excluded, as are pending/approved shops. These queries follow `User::isWorkAccount()` through a matching SQL scope. Rejected hub/courier applicants and disapproved riders with an ordinary buyer role may shop again under the existing policy.

Sellers still buy from other shops. The count/directory correction does not rewrite roles, remove accounts or alter shopping permissions. Existing rider/hub/courier restrictions remain enforced by `EnsureShopper` on both web and Flutter API requests. Buyer identity-review queues, badges and approve/reject actions exclude work accounts while still allowing sellers with a buyer identity to complete customer verification.

Account figures include seeded/demo records. They are counts of database accounts, not verified real people. Shop and rider metrics retain their documented profile-based definitions; they should not be added together as mutually exclusive user totals.

`PATCH /admin/users/{user}/suspend` and `/reactivate` now return 409 for `unverified` and `pending_activation` accounts. A row lock checks the current status before mutation. These actions cannot replace email verification or rider activation, including a suspend-then-reactivate sequence. Admin reactivation through this endpoint returns 403, matching the existing protection against admin suspension. Valid active/suspended account management continues to work.

The Platform Commission Net card uses the existing `/admin/dashboard-feed` daily `chart_data[].commission` series. Each bar is the stored platform commission on counted orders placed on that Manila calendar date, over the same 30-day window as the summary. Cancelled and returned orders follow the existing reports exclusions. No fees, payouts or commission calculations were changed. Missing and all-zero series have explicit empty states; the chart does not invent activity or replace unavailable values with zero.
