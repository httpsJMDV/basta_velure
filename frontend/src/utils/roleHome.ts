import type { User } from '../types';

/**
 * A hub, courier company, rider or truck driver account (User::isWorkAccount on the server). These run deliveries and
 * never shop: only a seller switches between selling and buying. The server says so in `work_account`; the fallback
 * reads the same profiles for an older payload.
 */
export function isWorkAccount(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.work_account === true) return true;
  if (user.role === 'rider') return true;
  if (user.rider && user.rider.status !== 'DISAPPROVED') return true;
  if (user.sorting_center && user.sorting_center.status !== 'REJECTED') return true;
  return Boolean(user.logistics_company && user.logistics_company.status !== 'REJECTED');
}

/**
 * Where a signed-in account lands: admin, then an approved seller, an approved hub owner, an active rider, and
 * everyone else (buyers, and applicants whose application is not approved yet) on the storefront.
 *
 * Sellers, hub owners and couriers keep users.role "buyer" (older courier accounts carry "rider"), so these checks read
 * the profile, not the role. A hub or courier application still in review lands on its status page, never the shop.
 */
export function roleHomePath(user: User): string {
  if (user.role === 'admin') return '/admin';
  if (user.logistics_company?.status === 'APPROVED') return '/logistics';
  if (user.sorting_center?.status === 'APPROVED') return '/hub/dashboard';
  // A suspended rider still signs in and sees why on the dashboard (RID-PROF-006).
  if (user.rider?.status === 'ACTIVE' || user.rider?.status === 'SUSPENDED') return '/rider/dashboard';
  if (isWorkAccount(user)) {
    if (user.logistics_company) return '/register/courier';
    if (user.sorting_center) return user.sorting_center.status === 'SUSPENDED' ? '/hub/dashboard' : '/register/hub';
    return '/rider/login';
  }
  if (user.role === 'seller' || user.seller_profile?.application_status === 'approved') return '/seller';
  return '/';
}
