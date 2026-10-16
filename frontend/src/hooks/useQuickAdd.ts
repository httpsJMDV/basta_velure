import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { useCart } from './useCart';
import { useToast } from '../components/ui/Toast';

/**
 * The cart button on a product card: a single-variant product goes straight into the cart; a product with options
 * (sizes, colours) opens its page so the buyer can pick one. A sold-out product does nothing.
 */
export function useQuickAdd(product: Product) {
  const { addItem } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [added, setAdded] = useState(false);
  const variants = product.variants ?? [];
  const single = variants.length === 1 ? variants[0] : null;
  const soldOut = variants.length > 0 && variants.every((v) => v.stock_quantity <= 0);

  async function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) return;
    if (!single) {
      navigate(`/products/${product.id}`);
      return;
    }
    try {
      await addItem({
        variantId: single.id,
        productId: product.id,
        name: product.name,
        variant: single.label && single.label !== 'Default' && single.label !== 'Standard' ? single.label : '',
        price: single.price,
        image: product.thumbnail_url ?? '',
        sellerId: product.seller.id,
        shopName: product.seller.shop_name,
      });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1400);
      showToast('Added to cart.', 'success');
    } catch {
      showToast('Could not add to cart. Please try again.', 'error');
    }
  }

  return { add, added, soldOut, needsChoice: !single };
}
