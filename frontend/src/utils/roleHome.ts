import type { User } from '../types';

/**
 * Where a signed-in account lands: admin, then an approved seller, an approved hub owner, an active rider, and
 * everyone else (buyers, and applicants whose application is not approved yet) on the storefront.
 *
 * Sellers, hub owners and couriers are buyers whose application was approved (users.role stays "buyer"; older courier
 * accounts carry "rider"), so these checks read the profile, not the role. A pending or refused applicant lands on the
 * storefront and sees the status on the application page; only a suspended hub is refused at sign-in.
 */
export function roleHomePath(user: User): string {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'seller' || user.seller_profile?.application_status === 'approved') return '/seller';
  if (user.logistics_company?.status === 'APPROVED') return '/logistics';
  if (user.sorting_center?.status === 'APPROVED') return '/hub/dashboard';
  if (user.rider?.status === 'ACTIVE') return '/rider/dashboard';
  return '/';
}
