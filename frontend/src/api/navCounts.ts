// The numbers on each portal's sidebar: how much is waiting on this account, item by item (docs/api/nav-counts.md).
import { http } from './client';

export interface AdminNavCounts {
  seller_applications: number;
  buyer_applications: number;
  courier_applications: number;
  hub_applications: number;
  products: number;
  payments: number;
  disputes: number;
  messages: number;
}

export interface SellerNavCounts {
  orders_new: number;
  orders_to_prepare: number;
  returns_to_answer: number;
  refunds_to_send: number;
  products_rejected: number;
  products_low_stock: number;
  messages: number;
}

export interface HubNavCounts {
  intake: number;
  sorting: number;
  dispatch: number;
  deliveries: number;
  riders: number;
}

export interface LogisticsNavCounts {
  hubs: number;
  riders: number;
  trucks: number;
  dispatch: number;
  parcels: number;
  returns: number;
  cod: number;
}

export interface RiderNavCounts {
  pickups: number;
  deliveries: number;
  trips: number;
}

const get = <T,>(path: string) => () => http.get<{ data: T }>(path).then((r) => r.data.data);

export const getAdminNavCountsApi = get<AdminNavCounts>('/admin/nav-counts');
export const getSellerNavCountsApi = get<SellerNavCounts>('/seller/nav-counts');
export const getHubNavCountsApi = get<HubNavCounts>('/hub/nav-counts');
export const getLogisticsNavCountsApi = get<LogisticsNavCounts>('/logistics/nav-counts');
export const getRiderNavCountsApi = get<RiderNavCounts>('/rider/nav-counts');
