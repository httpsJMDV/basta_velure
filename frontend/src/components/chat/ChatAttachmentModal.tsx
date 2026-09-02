import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, Package, Image as ImageIcon, X, Search, Upload, Loader2 } from 'lucide-react';
import { getAttachableProductsApi, getAttachableOrdersApi } from '../../api/client';
import type { Conversation } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  onAttachProduct: (product: any) => void;
  onAttachOrder: (order: any) => void;
  onAttachImage: (file: File) => void;
  allowAllOrders?: boolean;
}

export default function ChatAttachmentModal({
  isOpen,
  onClose,
  conversation,
  onAttachProduct,
  onAttachOrder,
  onAttachImage,
}: Props) {
  const [tab, setTab] = useState<'product' | 'order' | 'image'>('product');
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fetch products & orders on open
  useEffect(() => {
    if (!isOpen || !conversation.id) return;
    setLoading(true);

    Promise.allSettled([
      getAttachableProductsApi(conversation.id),
      getAttachableOrdersApi(conversation.id),
    ])
      .then(([prodRes, ordRes]) => {
        if (prodRes.status === 'fulfilled') setProducts(prodRes.value || []);
        if (ordRes.status === 'fulfilled') setOrders(ordRes.value || []);
      })
      .finally(() => setLoading(false));
  }, [isOpen, conversation.id]);

  if (!isOpen) return null;

  const filteredProducts = products.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrders = orders.filter((o) =>
    o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.items_summary?.toLowerCase().includes(search.toLowerCase())
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAttachImage(file);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 tracking-tight">Add Attachment</h3>
              <span className="text-[10px] bg-rose-50 text-brand-red font-bold px-2 py-0.5 rounded-full border border-rose-100">
                Verified
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Share store products, recent orders, or upload photos</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 px-6 pt-2.5 gap-2 bg-gray-50/70">
          <button
            type="button"
            onClick={() => { setTab('product'); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all ${
              tab === 'product'
                ? 'border-brand-red text-brand-red bg-white shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Products ({products.length})</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('order'); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all ${
              tab === 'order'
                ? 'border-brand-red text-brand-red bg-white shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Orders ({orders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('image'); setSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all ${
              tab === 'image'
                ? 'border-brand-red text-brand-red bg-white shadow-2xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photo / Image</span>
          </button>
        </div>

        {/* Search Bar for list tabs */}
        {tab !== 'image' && (
          <div className="px-6 py-3 border-b border-gray-100 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={tab === 'product' ? 'Search store products by name or category...' : 'Search orders by order number or item...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red transition-all"
              />
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#fafafa]">
          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center gap-2.5 text-gray-400 text-xs">
              <Loader2 className="w-7 h-7 animate-spin text-brand-red" />
              <span className="font-medium text-gray-600">Loading attachable items...</span>
            </div>
          ) : tab === 'product' ? (
            filteredProducts.length === 0 ? (
              <div className="py-14 text-center text-gray-400 text-xs">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2.5">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <p className="font-bold text-gray-700">No products found</p>
                <p className="text-[11px] mt-0.5 text-gray-400">No active products match your search for this conversation.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onAttachProduct(p);
                      onClose();
                    }}
                    className="p-3 bg-white hover:bg-rose-50/60 border border-gray-200 hover:border-brand-red/40 rounded-2xl cursor-pointer flex items-center justify-between gap-3 transition-all shadow-2xs group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-rose-50 text-brand-red flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        {p.category && (
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{p.category}</span>
                        )}
                        <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs font-black text-brand-red mt-0.5">
                          ₱{Number(p.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 bg-gray-100 group-hover:bg-brand-red group-hover:text-white text-gray-700 text-xs font-bold rounded-xl transition-all shrink-0 shadow-2xs"
                    >
                      Attach
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'order' ? (
            filteredOrders.length === 0 ? (
              <div className="py-14 text-center text-gray-400 text-xs">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-2.5">
                  <Package className="w-6 h-6" />
                </div>
                <p className="font-bold text-gray-700">No orders found</p>
                <p className="text-[11px] mt-0.5 text-gray-400">No matching orders found between these participants.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredOrders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => {
                      onAttachOrder(o);
                      onClose();
                    }}
                    className="p-3 bg-white hover:bg-blue-50/60 border border-gray-200 hover:border-blue-300 rounded-2xl cursor-pointer flex items-center justify-between gap-3 transition-all shadow-2xs group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-gray-900">Order #{o.order_number}</p>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                            {o.status}
                          </span>
                        </div>
                        {o.items_summary && (
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{o.items_summary}</p>
                        )}
                        <p className="text-xs font-black text-blue-700 mt-0.5">
                          ₱{Number(o.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 bg-gray-100 group-hover:bg-blue-600 group-hover:text-white text-gray-700 text-xs font-bold rounded-xl transition-all shrink-0 shadow-2xs"
                    >
                      Attach
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            // IMAGE UPLOAD TAB
            <div className="flex flex-col items-center justify-center py-6">
              <label className="w-full max-w-sm border-2 border-dashed border-gray-300 hover:border-brand-red rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-rose-50/30 transition-all text-center group bg-white shadow-2xs">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-2xs">
                  <Upload className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-gray-800">Click to upload an image</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP, or GIF up to 5MB</p>
                <span className="mt-4 px-4 py-2 bg-brand-red hover:bg-[#8A2323] text-white text-xs font-bold rounded-xl shadow-xs transition-colors">
                  Select Photo
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
