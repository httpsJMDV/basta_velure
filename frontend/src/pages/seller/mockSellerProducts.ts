import type { SellerProduct, SellerProductCounts } from '../../types';

export function computeCounts(products: SellerProduct[]): SellerProductCounts {
  return {
    all: products.length,
    active: products.filter((p) => p.status === 'active').length,
    pending_review: products.filter((p) => p.status === 'pending_review').length,
    rejected: products.filter((p) => p.status === 'rejected').length,
    out_of_stock: products.filter((p) => p.total_stock === 0).length,
    archived: products.filter((p) => p.status === 'archived').length,
  };
}
