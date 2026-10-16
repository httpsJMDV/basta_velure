import { useEffect, useState } from 'react';
import { getStorefrontCategoriesApi } from '../api/client';
import type { StorefrontCategory } from '../types';

// One request per page load, shared by the header's Categories menu and the landing page.
let cache: Promise<StorefrontCategory[]> | null = null;

function load(): Promise<StorefrontCategory[]> {
  cache ??= getStorefrontCategoriesApi().catch((err) => {
    cache = null; // let the next mount retry
    throw err;
  });
  return cache;
}

/** The storefront category tree (GET /categories), or null while it loads. */
export function useStorefrontCategories(): StorefrontCategory[] | null {
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((list) => { if (alive) setCategories(list); }).catch(() => { if (alive) setCategories([]); });
    return () => { alive = false; };
  }, []);

  return categories;
}
