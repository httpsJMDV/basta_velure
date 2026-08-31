import { Link } from 'react-router-dom';
import { Star, MapPin, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Product } from '../../types';
import { resolveShortLocation } from '../../utils/psgc';

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Stars({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= Math.round(r) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
        />
      ))}
      <span className="text-[11px] text-gray-400 ml-0.5">({count})</span>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  /** list = horizontal row layout; default = grid card */
  list?: boolean;
}

export default function ProductCard({ product, list = false }: ProductCardProps) {
  const isOnSale = product.original_price != null && product.original_price > product.base_price;
  const discount = isOnSale ? Math.round((1 - product.base_price / product.original_price!) * 100) : 0;
  const soldLabel = product.units_sold > 0 ? `${product.units_sold.toLocaleString()} sold` : 'New';

  const [location, setLocation] = useState<string>('—');
  useEffect(() => {
    resolveShortLocation(product.seller.province, product.seller.city)
      .then((name) => setLocation(name || '—'));
  }, [product.seller.province, product.seller.city]);

  if (list) {
    return (
      <Link
        to={`/products/${product.id}`}
        className="flex gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden p-3"
      >
        <div className="w-28 h-28 shrink-0 rounded-xl bg-gray-100 overflow-hidden">
          {product.thumbnail_url
            ? <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
          }
        </div>
        <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
          <div>
            <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
            <Stars rating={product.avg_rating} count={product.review_count} />
          </div>
          <div className="flex items-end justify-between gap-2 flex-wrap">
            <div>
              <span className="text-base font-black text-brand-red">{fmt(product.base_price)}</span>
              {isOnSale && <span className="ml-2 text-xs text-gray-400 line-through">{fmt(product.original_price!)}</span>}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span>{soldLabel}</span>
              <span className="flex items-center gap-0.5">
                <MapPin className="w-3 h-3 shrink-0" />{location}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {product.thumbnail_url
          ? <img src={product.thumbnail_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-300" /></div>
        }
        {isOnSale && (
          <span className="absolute top-2 left-2 bg-brand-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            -{discount}%
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
        <div className="mt-auto flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-base font-black text-brand-red">{fmt(product.base_price)}</span>
            {isOnSale && <span className="text-xs text-gray-400 line-through">{fmt(product.original_price!)}</span>}
          </div>
          <Stars rating={product.avg_rating} count={product.review_count} />
          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-0.5">
            <span>{soldLabel}</span>
            <span className="flex items-center gap-0.5 truncate max-w-[55%]">
              <MapPin className="w-3 h-3 shrink-0" />{location}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
