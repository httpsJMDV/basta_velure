/** The public address of a shop page on this site (https://loved-it.shop/shop/<slug> in production). */
export function shopUrl(slug: string): string {
  return `${window.location.origin}/shop/${slug}`;
}

/** The same address without the scheme, for display (loved-it.shop/shop/<slug>). */
export function shopUrlLabel(slug: string): string {
  return `${window.location.host}/shop/${slug}`;
}
