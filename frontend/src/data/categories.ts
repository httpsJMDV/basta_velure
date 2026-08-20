export const CATEGORIES = [
  'Electronics',
  'Fashion',
  'Home & Living',
  'Sports & Outdoors',
  'Health & Beauty',
  'Food & Grocery',
  'Toys & Games',
  'Books & Stationery',
] as const;

export type Category = typeof CATEGORIES[number];

/** Dropdown options for the seller registration line-of-business field. */
export const CATEGORY_OPTIONS = [
  ...CATEGORIES.map((c) => ({ value: c, label: c })),
  { value: 'others', label: 'Others (specify below)' },
];
