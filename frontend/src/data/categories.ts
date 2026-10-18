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
      { id: 'tablets', label: 'Tablets' },
      { id: 'smartwatches-wearables', label: 'Smartwatches & Wearables' },
      { id: 'desktops-monitors', label: 'Desktops & Monitors' },
      { id: 'keyboards-mice', label: 'Keyboards & Mice' },
      { id: 'cameras', label: 'Cameras' },
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
      { id: 'televisions', label: 'Televisions' },
      { id: 'microwaves-ovens', label: 'Microwaves & Ovens' },
      { id: 'vacuum-cleaners', label: 'Vacuum Cleaners' },
      { id: 'water-dispensers', label: 'Water Dispensers' },
      { id: 'irons-steamers', label: 'Irons & Steamers' },
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
      { id: 'bath-essentials', label: 'Bath Essentials' },
      { id: 'curtains-blinds', label: 'Curtains & Blinds' },
      { id: 'cleaning-supplies', label: 'Cleaning Supplies' },
      { id: 'dinnerware', label: 'Dinnerware' },
      { id: 'plants-gardening', label: 'Plants & Gardening' },
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
      { id: 'paint-supplies', label: 'Paint & Supplies' },
      { id: 'electrical-supplies', label: 'Electrical Supplies' },
      { id: 'safety-gear', label: 'Safety Gear' },
      { id: 'garden-tools', label: 'Garden Tools' },
      { id: 'ladders', label: 'Ladders' },
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
      { id: 'car-electronics', label: 'Car Electronics' },
      { id: 'tires-wheels', label: 'Tires & Wheels' },
      { id: 'motorcycle-accessories', label: 'Motorcycle Accessories' },
      { id: 'oils-fluids', label: 'Oils & Fluids' },
      { id: 'riding-gear', label: 'Riding Gear' },
      { id: 'car-parts', label: 'Car Parts' },
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
      { id: 'skirts', label: 'Skirts' },
      { id: 'womens-sleepwear', label: 'Sleepwear' },
      { id: 'womens-swimwear', label: 'Swimwear' },
      { id: 'womens-activewear', label: 'Activewear' },
      { id: 'womens-coord-sets', label: 'Co-ord Sets' },
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
      { id: 'polo-shirts', label: 'Polo Shirts' },
      { id: 'shorts', label: 'Shorts' },
      { id: 'mens-underwear-socks', label: 'Underwear & Socks' },
      { id: 'mens-activewear', label: 'Activewear' },
      { id: 'barong-formal', label: 'Barong & Formal Wear' },
      { id: 'caps-hats', label: 'Caps & Hats' },
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
      { id: 'backpacks', label: 'Backpacks' },
      { id: 'luggage-travel', label: 'Luggage & Travel' },
      { id: 'belts', label: 'Belts' },
      { id: 'hair-accessories', label: 'Hair Accessories' },
      { id: 'umbrellas', label: 'Umbrellas' },
      { id: 'sling-bags', label: 'Sling Bags' },
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
      { id: 'haircare', label: 'Hair Care' },
      { id: 'fragrances', label: 'Fragrances' },
      { id: 'bath-body', label: 'Bath & Body' },
      { id: 'oral-care', label: 'Oral Care' },
      { id: 'medical-supplies', label: 'Medical Supplies' },
      { id: 'nail-care', label: 'Nail Care' },
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
      { id: 'basketball', label: 'Basketball' },
      { id: 'running', label: 'Running' },
      { id: 'swimming', label: 'Swimming' },
      { id: 'racket-sports', label: 'Racket Sports' },
      { id: 'fishing', label: 'Fishing' },
      { id: 'yoga', label: 'Yoga' },
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
      { id: 'coffee-tea', label: 'Coffee & Tea', requiresFdaDoc: true },
      { id: 'canned-goods', label: 'Canned Goods', requiresFdaDoc: true },
      { id: 'condiments-sauces', label: 'Condiments & Sauces', requiresFdaDoc: true },
      { id: 'baking-supplies', label: 'Baking Supplies', requiresFdaDoc: true },
      { id: 'dairy-eggs', label: 'Dairy & Eggs', requiresFdaDoc: true },
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
      { id: 'baby-toys', label: 'Baby Toys' },
      { id: 'baby-bath-skincare', label: 'Baby Bath & Skincare' },
      { id: 'nursery', label: 'Nursery' },
      { id: 'kids-shoes', label: "Kids' Shoes" },
      { id: 'maternity', label: 'Maternity' },
      { id: 'baby-safety', label: 'Baby Safety' },
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
      { id: 'board-games-puzzles', label: 'Board Games & Puzzles' },
      { id: 'musical-instruments', label: 'Musical Instruments' },
      { id: 'arts-crafts', label: 'Arts & Crafts' },
      { id: 'video-games', label: 'Video Games' },
      { id: 'educational-toys', label: 'Educational Toys' },
      { id: 'outdoor-play', label: 'Outdoor Play' },
    ],
  },
  {
    id: 'pet-supplies',
    label: 'Pet Supplies',
    children: [
      { id: 'pet-food', label: 'Pet Food' },
      { id: 'pet-accessories', label: 'Pet Accessories' },
      { id: 'pet-health-grooming', label: 'Pet Health & Grooming' },
      { id: 'cat-litter', label: 'Cat Litter' },
      { id: 'pet-toys', label: 'Pet Toys' },
      { id: 'pet-beds', label: 'Pet Beds & Houses' },
      { id: 'aquarium', label: 'Aquarium & Fish' },
      { id: 'bird-supplies', label: 'Bird Supplies' },
      { id: 'pet-carriers', label: 'Pet Carriers' },
      { id: 'pet-treats', label: 'Pet Treats' },
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
