<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Fills out the storefront's Categories menu: every main category gets ten sub-categories (it had three to five).
 * A sub-category is added only when its slug is free and its main category exists; existing categories are never
 * changed. A new food sub-category asks for FDA documents like its siblings, and takes the commission rate its
 * siblings share (so Food & Grocery keeps one rate). Each one has a photo in the web app (assets/categories/photos).
 */
return new class extends Migration
{
    /** main category slug => [slug, name] of the sub-categories to add */
    public const ADD = [
        'mobile-gadgets-computers' => [
            ['tablets', 'Tablets'], ['smartwatches-wearables', 'Smartwatches & Wearables'], ['desktops-monitors', 'Desktops & Monitors'],
            ['keyboards-mice', 'Keyboards & Mice'], ['cameras', 'Cameras'],
        ],
        'food-grocery' => [
            ['coffee-tea', 'Coffee & Tea'], ['canned-goods', 'Canned Goods'], ['condiments-sauces', 'Condiments & Sauces'],
            ['baking-supplies', 'Baking Supplies'], ['dairy-eggs', 'Dairy & Eggs'],
        ],
        'home-appliances' => [
            ['televisions', 'Televisions'], ['microwaves-ovens', 'Microwaves & Ovens'], ['vacuum-cleaners', 'Vacuum Cleaners'],
            ['water-dispensers', 'Water Dispensers'], ['irons-steamers', 'Irons & Steamers'],
        ],
        'home-living' => [
            ['bath-essentials', 'Bath Essentials'], ['curtains-blinds', 'Curtains & Blinds'], ['cleaning-supplies', 'Cleaning Supplies'],
            ['dinnerware', 'Dinnerware'], ['plants-gardening', 'Plants & Gardening'],
        ],
        'home-improvement-tools' => [
            ['paint-supplies', 'Paint & Supplies'], ['electrical-supplies', 'Electrical Supplies'], ['safety-gear', 'Safety Gear'],
            ['garden-tools', 'Garden Tools'], ['ladders', 'Ladders'],
        ],
        'womens-fashion' => [
            ['skirts', 'Skirts'], ['womens-sleepwear', 'Sleepwear'], ['womens-swimwear', 'Swimwear'],
            ['womens-activewear', 'Activewear'], ['womens-coord-sets', 'Co-ord Sets'],
        ],
        'mens-fashion' => [
            ['polo-shirts', 'Polo Shirts'], ['shorts', 'Shorts'], ['mens-underwear-socks', 'Underwear & Socks'],
            ['mens-activewear', 'Activewear'], ['barong-formal', 'Barong & Formal Wear'], ['caps-hats', 'Caps & Hats'],
        ],
        'bags-accessories' => [
            ['backpacks', 'Backpacks'], ['luggage-travel', 'Luggage & Travel'], ['belts', 'Belts'],
            ['hair-accessories', 'Hair Accessories'], ['umbrellas', 'Umbrellas'], ['sling-bags', 'Sling Bags'],
        ],
        'health-beauty' => [
            ['haircare', 'Hair Care'], ['fragrances', 'Fragrances'], ['bath-body', 'Bath & Body'],
            ['oral-care', 'Oral Care'], ['medical-supplies', 'Medical Supplies'], ['nail-care', 'Nail Care'],
        ],
        'sports-outdoors' => [
            ['basketball', 'Basketball'], ['running', 'Running'], ['swimming', 'Swimming'],
            ['racket-sports', 'Racket Sports'], ['fishing', 'Fishing'], ['yoga', 'Yoga'],
        ],
        'automotive-motorcycle' => [
            ['car-electronics', 'Car Electronics'], ['tires-wheels', 'Tires & Wheels'], ['motorcycle-accessories', 'Motorcycle Accessories'],
            ['oils-fluids', 'Oils & Fluids'], ['riding-gear', 'Riding Gear'], ['car-parts', 'Car Parts'],
        ],
        'baby-kids' => [
            ['baby-toys', 'Baby Toys'], ['baby-bath-skincare', 'Baby Bath & Skincare'], ['nursery', 'Nursery'],
            ['kids-shoes', "Kids' Shoes"], ['maternity', 'Maternity'], ['baby-safety', 'Baby Safety'],
        ],
        'toys-hobbies-books' => [
            ['board-games-puzzles', 'Board Games & Puzzles'], ['musical-instruments', 'Musical Instruments'], ['arts-crafts', 'Arts & Crafts'],
            ['video-games', 'Video Games'], ['educational-toys', 'Educational Toys'], ['outdoor-play', 'Outdoor Play'],
        ],
        'pet-supplies' => [
            ['cat-litter', 'Cat Litter'], ['pet-toys', 'Pet Toys'], ['pet-beds', 'Pet Beds & Houses'], ['aquarium', 'Aquarium & Fish'],
            ['bird-supplies', 'Bird Supplies'], ['pet-carriers', 'Pet Carriers'], ['pet-treats', 'Pet Treats'],
        ],
    ];

    public function up(): void
    {
        $now = now();
        foreach (self::ADD as $parentSlug => $children) {
            $parent = DB::table('categories')->where('slug', $parentSlug)->whereNull('parent_id')->first(['id']);
            if (! $parent) {
                continue;
            }
            $siblings = DB::table('categories')->where('parent_id', $parent->id)->get(['sort_order', 'requires_fda', 'commission_rate']);
            $order = (int) $siblings->max('sort_order');
            // What every existing sibling shares (all FDA food, one commission rate) carries over to the new ones.
            $fda = $siblings->isNotEmpty() && $siblings->every(fn ($s) => (bool) $s->requires_fda);
            $rates = $siblings->pluck('commission_rate')->unique()->values();
            $rate = $rates->count() === 1 ? $rates->first() : null;

            foreach ($children as [$slug, $name]) {
                if (DB::table('categories')->where('slug', $slug)->exists()) {
                    continue;
                }
                DB::table('categories')->insert([
                    'parent_id'       => $parent->id,
                    'name'            => $name,
                    'slug'            => $slug,
                    'sort_order'      => ++$order,
                    'is_active'       => true,
                    'requires_fda'    => $fda,
                    'commission_rate' => $rate,
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ]);
            }
        }
        Cache::forget('storefront.categories');
    }

    /** Removes the added sub-categories that nothing was listed in yet. */
    public function down(): void
    {
        $slugs = collect(self::ADD)->flatten(1)->pluck(0)->all();
        $used = DB::table('products')->join('categories', 'categories.id', '=', 'products.category_id')->whereIn('categories.slug', $slugs)->pluck('categories.slug')->all();
        DB::table('categories')->whereIn('slug', array_diff($slugs, $used))->delete();
        Cache::forget('storefront.categories');
    }
};
