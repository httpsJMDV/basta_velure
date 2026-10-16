import { Link } from 'react-router-dom';
import { Star, MapPin, Package, ShoppingCart, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Product } from '../../types';
import { resolveShortLocation } from '../../utils/psgc';
import { useQuickAdd } from '../../hooks/useQuickAdd';
import { pesoCompact as peso, discountPercent } from '../../utils/pricing';

/** 950 sold, 1.2K sold */
function soldText(units: number) {
  if (units <= 0) return null;
  return `${units >= 1000 ? `${(units / 1000).toFixed(units >= 10000 ? 0 : 1).replace(/\.0$/, '')}K` : units} sold`;
}

function Stars({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(r) ? 'fill-gray-900 text-gray-900' : 'fill-gray-200 text-gray-200'}`} />
      ))}
      <span className="text-[11px] text-gray-500 ml-1">{count.toLocaleString()}</span>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  /** list = horizontal row layout; default = grid card */
  list?: boolean;
}

export default function ProductCard({ product, list = false }: ProductCardProps) {
  const discount = discountPercent(product.base_price, product.original_price);
  const isOnSale = discount > 0;
  const sold = soldText(product.units_sold);
  const { add, added, soldOut, needsChoice } = useQuickAdd(product);

  if (list) return <ListCard product={product} isOnSale={isOnSale} discount={discount} sold={sold} />;

  return (
    <Link to={`/products/${product.id}`} className="group flex flex-col min-w-0" title={product.name}>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-50 ring-1 ring-gray-100">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-9 h-9 text-gray-300" /></div>}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 py-1 text-center text-[11px] font-semibold text-white bg-black/55 backdrop-blur-[2px]">Sold out</span>
        )}
      </div>

      <div className="pt-2 px-0.5 flex flex-col gap-1">
        <p className="text-[13px] leading-snug text-gray-800 truncate group-hover:text-brand-red transition-colors">{product.name}</p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
            <span className="text-[15px] font-bold text-gray-900 tracking-tight">{peso(product.base_price)}</span>
            {isOnSale && <span className="text-[11px] text-gray-400 line-through">{peso(product.original_price!)}</span>}
            {sold && <span className="text-[11px] text-gray-500">{sold}</span>}
            {isOnSale && (
              <span className="px-1 text-[10px] font-semibold leading-4 text-brand-red border border-brand-red/50 rounded">-{discount}%</span>
            )}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={soldOut}
            title={soldOut ? 'Sold out' : needsChoice ? 'Choose an option' : 'Add to cart'}
            aria-label={soldOut ? 'Sold out' : needsChoice ? `Choose an option for ${product.name}` : `Add ${product.name} to cart`}
            className={`shrink-0 w-8 h-8 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-200 active:scale-90 ${
              added ? 'bg-emerald-500 border-emerald-500 text-white'
                : soldOut ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-800 text-gray-800 hover:bg-brand-red hover:border-brand-red hover:text-white'
            }`}
          >
            {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
          </button>
        </div>

        {product.review_count > 0
          ? <Stars rating={product.avg_rating} count={product.review_count} />
          : <span className="text-[11px] text-gray-400 truncate">{product.seller.shop_name}</span>}
      </div>
    </Link>
  );
}

function ListCard({ product, isOnSale, discount, sold }: { product: Product; isOnSale: boolean; discount: number; sold: string | null }) {
  const [location, setLocation] = useState<string>('—');
  useEffect(() => {
    resolveShortLocation(product.seller.province, product.seller.city).then((name) => setLocation(name || '—'));
  }, [product.seller.province, product.seller.city]);

  return (
    <Link
      to={`/products/${product.id}`}
      className="flex gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-3"
    >
      <div className="w-28 h-28 shrink-0 rounded-xl bg-gray-100 overflow-hidden">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>}
      </div>
      <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
          {product.review_count > 0 && <Stars rating={product.avg_rating} count={product.review_count} />}
        </div>
        <div className="flex items-end justify-between gap-2 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-black text-brand-red">{peso(product.base_price)}</span>
            {isOnSale && <span className="text-xs text-gray-400 line-through">{peso(product.original_price!)}</span>}
            {isOnSale && <span className="px-1 text-[10px] font-semibold text-brand-red border border-brand-red/50 rounded">-{discount}%</span>}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span>{sold ?? 'New'}</span>
            <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3 shrink-0" />{location}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
