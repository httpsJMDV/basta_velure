import type { User } from '../types';

/**
 * Where a signed-in account lands: admin, then an approved seller, an approved hub owner, an active rider, and
 * everyone else (buyers, and applicants whose application is not approved yet) on the storefront.
 *
 * A seller is a buyer whose seller application was approved (users.role stays "buyer"), so the seller check reads the
 * profile, not the role. Pending, rejected and suspended hub and rider accounts never get this far: the server
 * refuses their sign-in with a message.
 */
export function roleHomePath(user: User): string {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'seller' || user.seller_profile?.application_status === 'approved') return '/seller';
  if (user.sorting_center?.status === 'APPROVED') return '/hub/dashboard';
  if (user.rider?.status === 'ACTIVE') return '/rider/dashboard';
  return '/';
}
