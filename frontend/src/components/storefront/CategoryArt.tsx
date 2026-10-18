import {
  Smartphone, Laptop, Headphones, BatteryCharging, Cable, Cookie, CupSoda, Apple, Soup, Wheat, Refrigerator, Fan,
  AirVent, WashingMachine, CookingPot, Sofa, Lamp, BedDouble, UtensilsCrossed, Archive, Hammer, Drill, Wrench,
  Lightbulb, ShowerHead, Shirt, Footprints, ShoppingBag, Gem, Watch, Glasses, Sparkles, Palette, HeartPulse, Pill,
  Dumbbell, Tent, Bike, Car, Cog, HardHat, SprayCan, Baby, Milk, Puzzle, Trophy, BookOpen, PenTool, PawPrint, Bone,
  Scissors, Store,
  Tablet, Monitor, Keyboard, Camera, Coffee, Package, CakeSlice, Egg, Tv, Microwave, Wind, Droplets, Bath, Blinds, Sprout, PaintRoller, Plug, Shovel, Construction, Moon, Waves, Backpack, Luggage, Umbrella, Smile, Stethoscope, Volleyball, Fish, Radio, CircleDot, Heart, ShieldCheck, Dices, Guitar, Brush, Gamepad2, GraduationCap, Sun, Cat, Home, Bird,
  type LucideIcon,
} from 'lucide-react';
import type { StorefrontCategory } from '../../types';

/**
 * One photo per category: public-domain photos from Openverse, cropped square (see assets/categories/photos/CREDITS.md).
 * A category without its own photo falls back to its best-selling product's photo, then to an icon.
 */
const PHOTOS = import.meta.glob('../../assets/categories/photos/*.jpg', { eager: true, import: 'default' }) as Record<string, string>;
const photoFor = (slug: string): string | undefined => PHOTOS[`../../assets/categories/photos/${slug}.jpg`];

/** The last fallback, for a category with neither a photo nor any product. */
const ICONS: Record<string, LucideIcon> = {
  'mobile-gadgets-computers': Smartphone, smartphones: Smartphone, laptops: Laptop, 'earphones-audio': Headphones,
  'chargers-powerbanks': BatteryCharging, 'phone-accessories': Cable,
  'food-grocery': Apple, snacks: Cookie, beverages: CupSoda, 'fresh-produce': Apple, 'instant-meals': Soup, 'pantry-staples': Wheat,
  'home-appliances': Refrigerator, refrigerators: Refrigerator, 'electric-fans': Fan, 'air-conditioners': AirVent,
  'washing-machines': WashingMachine, 'rice-cookers-kitchen': CookingPot,
  'home-living': Sofa, furniture: Sofa, 'home-decor': Lamp, 'bedding-linens': BedDouble, kitchenware: UtensilsCrossed, 'storage-organization': Archive,
  'home-improvement-tools': Hammer, 'hand-tools': Hammer, 'power-tools': Drill, hardware: Wrench, lighting: Lightbulb, 'plumbing-supplies': ShowerHead,
  'womens-fashion': Shirt, 'womens-tops': Shirt, dresses: Shirt, 'womens-bottoms': Scissors, 'womens-outerwear': Shirt, 'womens-footwear': Footprints,
  'mens-fashion': Shirt, shirts: Shirt, pants: Scissors, 'mens-outerwear': Shirt, 'mens-footwear': Footprints,
  'bags-accessories': ShoppingBag, 'bags-wallets': ShoppingBag, jewelry: Gem, watches: Watch, sunglasses: Glasses,
  'health-beauty': Sparkles, skincare: Sparkles, makeup: Palette, 'personal-care': HeartPulse, supplements: Pill,
  'sports-outdoors': Dumbbell, 'fitness-equipment': Dumbbell, 'outdoor-gear': Tent, sportswear: Shirt, bicycles: Bike,
  'automotive-motorcycle': Car, 'car-accessories': Car, 'motorcycle-parts': Cog, helmets: HardHat, 'car-care': SprayCan,
  'baby-kids': Baby, 'baby-gear': Baby, 'kids-clothing': Shirt, 'feeding-nursing': Milk, diapers: Baby,
  'toys-hobbies-books': Puzzle, toys: Puzzle, 'collectibles-hobbies': Trophy, books: BookOpen, stationery: PenTool,
  'pet-supplies': PawPrint, 'pet-food': Bone, 'pet-accessories': PawPrint, 'pet-health-grooming': Scissors,

  tablets: Tablet, 'smartwatches-wearables': Watch, 'desktops-monitors': Monitor, 'keyboards-mice': Keyboard, cameras: Camera,
  'coffee-tea': Coffee, 'canned-goods': Package, 'condiments-sauces': Soup, 'baking-supplies': CakeSlice, 'dairy-eggs': Egg,
  televisions: Tv, 'microwaves-ovens': Microwave, 'vacuum-cleaners': Wind, 'water-dispensers': Droplets, 'irons-steamers': Shirt,
  'bath-essentials': Bath, 'curtains-blinds': Blinds, 'cleaning-supplies': SprayCan, dinnerware: UtensilsCrossed, 'plants-gardening': Sprout,
  'paint-supplies': PaintRoller, 'electrical-supplies': Plug, 'safety-gear': HardHat, 'garden-tools': Shovel, ladders: Construction,
  skirts: Shirt, 'womens-sleepwear': Moon, 'womens-swimwear': Waves, 'womens-activewear': Dumbbell, 'womens-coord-sets': Shirt,
  'polo-shirts': Shirt, shorts: Scissors, 'mens-underwear-socks': Shirt, 'mens-activewear': Dumbbell, 'barong-formal': Shirt, 'caps-hats': HardHat,
  backpacks: Backpack, 'luggage-travel': Luggage, belts: Gem, 'hair-accessories': Sparkles, umbrellas: Umbrella, 'sling-bags': ShoppingBag,
  haircare: Sparkles, fragrances: SprayCan, 'bath-body': Bath, 'oral-care': Smile, 'medical-supplies': Stethoscope, 'nail-care': Palette,
  basketball: Volleyball, running: Footprints, swimming: Waves, 'racket-sports': Trophy, fishing: Fish, yoga: HeartPulse,
  'car-electronics': Radio, 'tires-wheels': CircleDot, 'motorcycle-accessories': Bike, 'oils-fluids': Droplets, 'riding-gear': HardHat, 'car-parts': Cog,
  'baby-toys': Puzzle, 'baby-bath-skincare': Bath, nursery: BedDouble, 'kids-shoes': Footprints, maternity: Heart, 'baby-safety': ShieldCheck,
  'board-games-puzzles': Dices, 'musical-instruments': Guitar, 'arts-crafts': Brush, 'video-games': Gamepad2, 'educational-toys': GraduationCap, 'outdoor-play': Sun,
  'cat-litter': Cat, 'pet-toys': Bone, 'pet-beds': Home, aquarium: Fish, 'bird-supplies': Bird, 'pet-carriers': Package, 'pet-treats': Cookie,
};

/** The picture for a category: its own photo, its best-selling product's photo, or an icon. */
export default function CategoryArt({ category, variant = 'tile' }: {
  category: StorefrontCategory;
  /** tile: rounded square (landing page); circle: round thumbnail (Categories menu, chips) */
  variant?: 'tile' | 'circle';
}) {
  const src = photoFor(category.slug) ?? category.image_url;
  const Icon = ICONS[category.slug] ?? Store;
  const shape = variant === 'circle' ? 'rounded-full' : 'rounded-2xl';

  if (src) {
    return <img src={src} alt="" loading="lazy" draggable={false} className={`w-full h-full object-cover bg-stone-100 ${shape}`} />;
  }

  return (
    <span className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-50 to-amber-50 text-brand-red/80 ${shape}`}>
      <Icon className="w-7 h-7" strokeWidth={1.6} aria-hidden="true" />
    </span>
  );
}
