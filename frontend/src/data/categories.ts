export interface CategoryNode {
  id: string;
  label: string;
  children: LeafCategory[];
}

export interface LeafCategory {
  id: string;
  label: string;
  requiresFdaDoc?: boolean;
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    id: 'mobile-gadgets-computers',
    label: 'Mobile, Gadgets & Computers',
    children: [
      { id: 'smartphones', label: 'Smartphones' },
      { id: 'laptops', label: 'Laptops' },
      { id: 'earphones-audio', label: 'Earphones & Audio' },
      { id: 'chargers-powerbanks', label: 'Chargers & Powerbanks' },
      { id: 'phone-accessories', label: 'Phone Accessories' },
    ],
  },
  {
    id: 'home-appliances',
    label: 'Home Appliances',
    children: [
      { id: 'refrigerators', label: 'Refrigerators' },
      { id: 'electric-fans', label: 'Electric Fans' },
      { id: 'air-conditioners', label: 'Air Conditioners' },
      { id: 'washing-machines', label: 'Washing Machines' },
      { id: 'rice-cookers-kitchen', label: 'Rice Cookers & Kitchen Appliances' },
    ],
  },
  {
    id: 'home-living',
    label: 'Home & Living',
    children: [
      { id: 'furniture', label: 'Furniture' },
      { id: 'home-decor', label: 'Home Decor' },
      { id: 'bedding-linens', label: 'Bedding & Linens' },
      { id: 'kitchenware', label: 'Kitchenware' },
      { id: 'storage-organization', label: 'Storage & Organization' },
    ],
  },
  {
    id: 'home-improvement-tools',
    label: 'Home Improvement & Tools',
    children: [
      { id: 'hand-tools', label: 'Hand Tools' },
      { id: 'power-tools', label: 'Power Tools' },
      { id: 'hardware', label: 'Hardware' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'plumbing-supplies', label: 'Plumbing Supplies' },
    ],
  },
  {
    id: 'automotive-motorcycle',
    label: 'Automotive & Motorcycle',
    children: [
      { id: 'car-accessories', label: 'Car Accessories' },
      { id: 'motorcycle-parts', label: 'Motorcycle Parts' },
      { id: 'helmets', label: 'Helmets' },
      { id: 'car-care', label: 'Car Care' },
    ],
  },
  {
    id: 'womens-fashion',
    label: "Women's Fashion",
    children: [
      { id: 'womens-tops', label: 'Tops' },
      { id: 'dresses', label: 'Dresses' },
      { id: 'womens-bottoms', label: 'Bottoms' },
      { id: 'womens-outerwear', label: 'Outerwear' },
      { id: 'womens-footwear', label: 'Footwear' },
    ],
  },
  {
    id: 'mens-fashion',
    label: "Men's Fashion",
    children: [
      { id: 'shirts', label: 'Shirts' },
      { id: 'pants', label: 'Pants' },
      { id: 'mens-outerwear', label: 'Outerwear' },
      { id: 'mens-footwear', label: 'Footwear' },
    ],
  },
  {
    id: 'bags-accessories',
    label: 'Bags & Accessories',
    children: [
      { id: 'bags-wallets', label: 'Bags & Wallets' },
      { id: 'jewelry', label: 'Jewelry' },
      { id: 'watches', label: 'Watches' },
      { id: 'sunglasses', label: 'Sunglasses' },
    ],
  },
  {
    id: 'health-beauty',
    label: 'Health & Beauty',
    children: [
      { id: 'skincare', label: 'Skincare' },
      { id: 'makeup', label: 'Makeup' },
      { id: 'personal-care', label: 'Personal Care' },
      { id: 'supplements', label: 'Supplements' },
    ],
  },
  {
    id: 'sports-outdoors',
    label: 'Sports & Outdoors',
    children: [
      { id: 'fitness-equipment', label: 'Fitness Equipment' },
      { id: 'outdoor-gear', label: 'Outdoor Gear' },
      { id: 'sportswear', label: 'Sportswear' },
      { id: 'bicycles', label: 'Bicycles' },
    ],
  },
  {
    id: 'food-grocery',
    label: 'Food & Grocery',
    children: [
      { id: 'snacks', label: 'Snacks', requiresFdaDoc: true },
      { id: 'beverages', label: 'Beverages', requiresFdaDoc: true },
      { id: 'fresh-produce', label: 'Fresh Produce', requiresFdaDoc: true },
      { id: 'instant-meals', label: 'Instant Meals', requiresFdaDoc: true },
      { id: 'pantry-staples', label: 'Pantry Staples', requiresFdaDoc: true },
    ],
  },
  {
    id: 'baby-kids',
    label: 'Baby & Kids',
    children: [
      { id: 'baby-gear', label: 'Baby Gear' },
      { id: 'kids-clothing', label: "Kids' Clothing" },
      { id: 'feeding-nursing', label: 'Feeding & Nursing' },
      { id: 'diapers', label: 'Diapers' },
    ],
  },
  {
    id: 'toys-hobbies-books',
    label: 'Toys, Hobbies & Books',
    children: [
      { id: 'toys', label: 'Toys' },
      { id: 'collectibles-hobbies', label: 'Collectibles & Hobbies' },
      { id: 'books', label: 'Books' },
      { id: 'stationery', label: 'Stationery' },
    ],
  },
  {
    id: 'pet-supplies',
    label: 'Pet Supplies',
    children: [
      { id: 'pet-food', label: 'Pet Food' },
      { id: 'pet-accessories', label: 'Pet Accessories' },
      { id: 'pet-health-grooming', label: 'Pet Health & Grooming' },
    ],
  },
];

/** Flat map of leaf id → LeafCategory for O(1) lookup */
export const LEAF_MAP = new Map(
  CATEGORY_TREE.flatMap((p) => p.children.map((c) => [c.id, c]))
);

/** Flat map of leaf id → parent CategoryNode */
export const LEAF_PARENT_MAP = new Map(
  CATEGORY_TREE.flatMap((p) => p.children.map((c) => [c.id, p]))
);

/** Returns true if the given leaf id requires FDA documents */
export function leafRequiresFda(leafId: string): boolean {
  return LEAF_MAP.get(leafId)?.requiresFdaDoc === true;
}
