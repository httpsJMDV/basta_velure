import {
  Smartphone, Laptop, Headphones, BatteryCharging, Cable, Cookie, CupSoda, Apple, Soup, Wheat, Refrigerator, Fan,
  AirVent, WashingMachine, CookingPot, Sofa, Lamp, BedDouble, UtensilsCrossed, Archive, Hammer, Drill, Wrench,
  Lightbulb, ShowerHead, Shirt, Footprints, ShoppingBag, Gem, Watch, Glasses, Sparkles, Palette, HeartPulse, Pill,
  Dumbbell, Tent, Bike, Car, Cog, HardHat, SprayCan, Baby, Milk, Puzzle, Trophy, BookOpen, PenTool, PawPrint, Bone,
  Scissors, Store, type LucideIcon,
} from 'lucide-react';
import type { StorefrontCategory } from '../../types';

import techGadgetsImg from '../../assets/categories/tech-gadgets.png';
import homeLivingImg from '../../assets/categories/home-living.png';
import fashionImg from '../../assets/categories/fashion.png';
import beautyImg from '../../assets/categories/beauty-wellness.png';
import sportsImg from '../../assets/categories/sports-outdoors.png';
import foodImg from '../../assets/categories/food-grocery.png';

/** Studio cut-outs for the main categories; every other category shows its best-selling product's photo. */
const STUDIO: Record<string, string> = {
  'mobile-gadgets-computers': techGadgetsImg,
  'home-living': homeLivingImg,
  'womens-fashion': fashionImg,
  'health-beauty': beautyImg,
  'sports-outdoors': sportsImg,
  'food-grocery': foodImg,
};

/** Shown for a category nobody sells in yet. */
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
};

/** The picture for a category: a studio cut-out, its best-selling product's photo, or an icon. */
export default function CategoryArt({ category, variant = 'tile', studio = true }: {
  category: StorefrontCategory;
  /** tile: square-ish art in a card; circle: round thumbnail for the Categories menu */
  variant?: 'tile' | 'circle';
  /** Prefer the studio cut-out for the main categories (landing page). */
  studio?: boolean;
}) {
  const src = (studio ? STUDIO[category.slug] : undefined) ?? category.image_url;
  const Icon = ICONS[category.slug] ?? Store;
  const round = variant === 'circle';

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        className={round
          ? 'w-full h-full object-cover rounded-full bg-white'
          : `w-full h-full ${STUDIO[category.slug] && studio ? 'object-contain' : 'object-contain rounded-xl mix-blend-multiply'}`}
      />
    );
  }

  return (
    <span className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-50 to-amber-50 text-brand-red/80 ${round ? 'rounded-full' : 'rounded-xl'}`}>
      <Icon className={round ? 'w-7 h-7' : 'w-7 h-7 sm:w-8 sm:h-8'} strokeWidth={1.6} aria-hidden="true" />
    </span>
  );
}
