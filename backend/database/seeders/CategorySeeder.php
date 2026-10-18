<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Category;
use Illuminate\Support\Facades\DB;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $taxonomy = [
            [
                'id' => 'mobile-gadgets-computers',
                'name' => 'Mobile, Gadgets & Computers',
                'children' => [
                    ['id' => 'smartphones', 'name' => 'Smartphones'],
                    ['id' => 'laptops', 'name' => 'Laptops'],
                    ['id' => 'earphones-audio', 'name' => 'Earphones & Audio'],
                    ['id' => 'chargers-powerbanks', 'name' => 'Chargers & Powerbanks'],
                    ['id' => 'phone-accessories', 'name' => 'Phone Accessories'],
                    ['id' => 'tablets', 'name' => 'Tablets'],
                    ['id' => 'smartwatches-wearables', 'name' => 'Smartwatches & Wearables'],
                    ['id' => 'desktops-monitors', 'name' => 'Desktops & Monitors'],
                    ['id' => 'keyboards-mice', 'name' => 'Keyboards & Mice'],
                    ['id' => 'cameras', 'name' => 'Cameras'],
                ],
            ],
            [
                'id' => 'food-grocery',
                'name' => 'Food & Grocery',
                'children' => [
                    ['id' => 'snacks', 'name' => 'Snacks', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'beverages', 'name' => 'Beverages', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'fresh-produce', 'name' => 'Fresh Produce', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'instant-meals', 'name' => 'Instant Meals', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'pantry-staples', 'name' => 'Pantry Staples', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'coffee-tea', 'name' => 'Coffee & Tea', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'canned-goods', 'name' => 'Canned Goods', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'condiments-sauces', 'name' => 'Condiments & Sauces', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'baking-supplies', 'name' => 'Baking Supplies', 'requires_fda' => true, 'commission_rate' => 8.0],
                    ['id' => 'dairy-eggs', 'name' => 'Dairy & Eggs', 'requires_fda' => true, 'commission_rate' => 8.0],
                ],
            ],
            [
                'id' => 'home-appliances',
                'name' => 'Home Appliances',
                'children' => [
                    ['id' => 'refrigerators', 'name' => 'Refrigerators'],
                    ['id' => 'electric-fans', 'name' => 'Electric Fans'],
                    ['id' => 'air-conditioners', 'name' => 'Air Conditioners'],
                    ['id' => 'washing-machines', 'name' => 'Washing Machines'],
                    ['id' => 'rice-cookers-kitchen', 'name' => 'Rice Cookers & Kitchen Appliances'],
                    ['id' => 'televisions', 'name' => 'Televisions'],
                    ['id' => 'microwaves-ovens', 'name' => 'Microwaves & Ovens'],
                    ['id' => 'vacuum-cleaners', 'name' => 'Vacuum Cleaners'],
                    ['id' => 'water-dispensers', 'name' => 'Water Dispensers'],
                    ['id' => 'irons-steamers', 'name' => 'Irons & Steamers'],
                ],
            ],
            [
                'id' => 'home-living',
                'name' => 'Home & Living',
                'children' => [
                    ['id' => 'furniture', 'name' => 'Furniture'],
                    ['id' => 'home-decor', 'name' => 'Home Decor'],
                    ['id' => 'bedding-linens', 'name' => 'Bedding & Linens'],
                    ['id' => 'kitchenware', 'name' => 'Kitchenware'],
                    ['id' => 'storage-organization', 'name' => 'Storage & Organization'],
                    ['id' => 'bath-essentials', 'name' => 'Bath Essentials'],
                    ['id' => 'curtains-blinds', 'name' => 'Curtains & Blinds'],
                    ['id' => 'cleaning-supplies', 'name' => 'Cleaning Supplies'],
                    ['id' => 'dinnerware', 'name' => 'Dinnerware'],
                    ['id' => 'plants-gardening', 'name' => 'Plants & Gardening'],
                ],
            ],
            [
                'id' => 'home-improvement-tools',
                'name' => 'Home Improvement & Tools',
                'children' => [
                    ['id' => 'hand-tools', 'name' => 'Hand Tools'],
                    ['id' => 'power-tools', 'name' => 'Power Tools'],
                    ['id' => 'hardware', 'name' => 'Hardware'],
                    ['id' => 'lighting', 'name' => 'Lighting'],
                    ['id' => 'plumbing-supplies', 'name' => 'Plumbing Supplies'],
                    ['id' => 'paint-supplies', 'name' => 'Paint & Supplies'],
                    ['id' => 'electrical-supplies', 'name' => 'Electrical Supplies'],
                    ['id' => 'safety-gear', 'name' => 'Safety Gear'],
                    ['id' => 'garden-tools', 'name' => 'Garden Tools'],
                    ['id' => 'ladders', 'name' => 'Ladders'],
                ],
            ],
            [
                'id' => 'womens-fashion',
                'name' => "Women's Fashion",
                'children' => [
                    ['id' => 'womens-tops', 'name' => 'Tops'],
                    ['id' => 'dresses', 'name' => 'Dresses'],
                    ['id' => 'womens-bottoms', 'name' => 'Bottoms'],
                    ['id' => 'womens-outerwear', 'name' => 'Outerwear'],
                    ['id' => 'womens-footwear', 'name' => 'Footwear'],
                    ['id' => 'skirts', 'name' => 'Skirts'],
                    ['id' => 'womens-sleepwear', 'name' => 'Sleepwear'],
                    ['id' => 'womens-swimwear', 'name' => 'Swimwear'],
                    ['id' => 'womens-activewear', 'name' => 'Activewear'],
                    ['id' => 'womens-coord-sets', 'name' => 'Co-ord Sets'],
                ],
            ],
            [
                'id' => 'mens-fashion',
                'name' => "Men's Fashion",
                'children' => [
                    ['id' => 'shirts', 'name' => 'Shirts'],
                    ['id' => 'pants', 'name' => 'Pants'],
                    ['id' => 'mens-outerwear', 'name' => 'Outerwear'],
                    ['id' => 'mens-footwear', 'name' => 'Footwear'],
                    ['id' => 'polo-shirts', 'name' => 'Polo Shirts'],
                    ['id' => 'shorts', 'name' => 'Shorts'],
                    ['id' => 'mens-underwear-socks', 'name' => 'Underwear & Socks'],
                    ['id' => 'mens-activewear', 'name' => 'Activewear'],
                    ['id' => 'barong-formal', 'name' => 'Barong & Formal Wear'],
                    ['id' => 'caps-hats', 'name' => 'Caps & Hats'],
                ],
            ],
            [
                'id' => 'bags-accessories',
                'name' => 'Bags & Accessories',
                'children' => [
                    ['id' => 'bags-wallets', 'name' => 'Bags & Wallets'],
                    ['id' => 'jewelry', 'name' => 'Jewelry'],
                    ['id' => 'watches', 'name' => 'Watches'],
                    ['id' => 'sunglasses', 'name' => 'Sunglasses'],
                    ['id' => 'backpacks', 'name' => 'Backpacks'],
                    ['id' => 'luggage-travel', 'name' => 'Luggage & Travel'],
                    ['id' => 'belts', 'name' => 'Belts'],
                    ['id' => 'hair-accessories', 'name' => 'Hair Accessories'],
                    ['id' => 'umbrellas', 'name' => 'Umbrellas'],
                    ['id' => 'sling-bags', 'name' => 'Sling Bags'],
                ],
            ],
            [
                'id' => 'health-beauty',
                'name' => 'Health & Beauty',
                'children' => [
                    ['id' => 'skincare', 'name' => 'Skincare'],
                    ['id' => 'makeup', 'name' => 'Makeup'],
                    ['id' => 'personal-care', 'name' => 'Personal Care'],
                    ['id' => 'supplements', 'name' => 'Supplements'],
                    ['id' => 'haircare', 'name' => 'Hair Care'],
                    ['id' => 'fragrances', 'name' => 'Fragrances'],
                    ['id' => 'bath-body', 'name' => 'Bath & Body'],
                    ['id' => 'oral-care', 'name' => 'Oral Care'],
                    ['id' => 'medical-supplies', 'name' => 'Medical Supplies'],
                    ['id' => 'nail-care', 'name' => 'Nail Care'],
                ],
            ],
            [
                'id' => 'sports-outdoors',
                'name' => 'Sports & Outdoors',
                'children' => [
                    ['id' => 'fitness-equipment', 'name' => 'Fitness Equipment'],
                    ['id' => 'outdoor-gear', 'name' => 'Outdoor Gear'],
                    ['id' => 'sportswear', 'name' => 'Sportswear'],
                    ['id' => 'bicycles', 'name' => 'Bicycles'],
                    ['id' => 'basketball', 'name' => 'Basketball'],
                    ['id' => 'running', 'name' => 'Running'],
                    ['id' => 'swimming', 'name' => 'Swimming'],
                    ['id' => 'racket-sports', 'name' => 'Racket Sports'],
                    ['id' => 'fishing', 'name' => 'Fishing'],
                    ['id' => 'yoga', 'name' => 'Yoga'],
                ],
            ],
            [
                'id' => 'automotive-motorcycle',
                'name' => 'Automotive & Motorcycle',
                'children' => [
                    ['id' => 'car-accessories', 'name' => 'Car Accessories'],
                    ['id' => 'motorcycle-parts', 'name' => 'Motorcycle Parts'],
                    ['id' => 'helmets', 'name' => 'Helmets'],
                    ['id' => 'car-care', 'name' => 'Car Care'],
                    ['id' => 'car-electronics', 'name' => 'Car Electronics'],
                    ['id' => 'tires-wheels', 'name' => 'Tires & Wheels'],
                    ['id' => 'motorcycle-accessories', 'name' => 'Motorcycle Accessories'],
                    ['id' => 'oils-fluids', 'name' => 'Oils & Fluids'],
                    ['id' => 'riding-gear', 'name' => 'Riding Gear'],
                    ['id' => 'car-parts', 'name' => 'Car Parts'],
                ],
            ],
            [
                'id' => 'baby-kids',
                'name' => 'Baby & Kids',
                'children' => [
                    ['id' => 'baby-gear', 'name' => 'Baby Gear'],
                    ['id' => 'kids-clothing', 'name' => "Kids' Clothing"],
                    ['id' => 'feeding-nursing', 'name' => 'Feeding & Nursing'],
                    ['id' => 'diapers', 'name' => 'Diapers'],
                    ['id' => 'baby-toys', 'name' => 'Baby Toys'],
                    ['id' => 'baby-bath-skincare', 'name' => 'Baby Bath & Skincare'],
                    ['id' => 'nursery', 'name' => 'Nursery'],
                    ['id' => 'kids-shoes', 'name' => "Kids' Shoes"],
                    ['id' => 'maternity', 'name' => 'Maternity'],
                    ['id' => 'baby-safety', 'name' => 'Baby Safety'],
                ],
            ],
            [
                'id' => 'toys-hobbies-books',
                'name' => 'Toys, Hobbies & Books',
                'children' => [
                    ['id' => 'toys', 'name' => 'Toys'],
                    ['id' => 'collectibles-hobbies', 'name' => 'Collectibles & Hobbies'],
                    ['id' => 'books', 'name' => 'Books'],
                    ['id' => 'stationery', 'name' => 'Stationery'],
                    ['id' => 'board-games-puzzles', 'name' => 'Board Games & Puzzles'],
                    ['id' => 'musical-instruments', 'name' => 'Musical Instruments'],
                    ['id' => 'arts-crafts', 'name' => 'Arts & Crafts'],
                    ['id' => 'video-games', 'name' => 'Video Games'],
                    ['id' => 'educational-toys', 'name' => 'Educational Toys'],
                    ['id' => 'outdoor-play', 'name' => 'Outdoor Play'],
                ],
            ],
            [
                'id' => 'pet-supplies',
                'name' => 'Pet Supplies',
                'children' => [
                    ['id' => 'pet-food', 'name' => 'Pet Food'],
                    ['id' => 'pet-accessories', 'name' => 'Pet Accessories'],
                    ['id' => 'pet-health-grooming', 'name' => 'Pet Health & Grooming'],
                    ['id' => 'cat-litter', 'name' => 'Cat Litter'],
                    ['id' => 'pet-toys', 'name' => 'Pet Toys'],
                    ['id' => 'pet-beds', 'name' => 'Pet Beds & Houses'],
                    ['id' => 'aquarium', 'name' => 'Aquarium & Fish'],
                    ['id' => 'bird-supplies', 'name' => 'Bird Supplies'],
                    ['id' => 'pet-carriers', 'name' => 'Pet Carriers'],
                    ['id' => 'pet-treats', 'name' => 'Pet Treats'],
                ],
            ],
        ];

        DB::transaction(function () use ($taxonomy) {
            foreach ($taxonomy as $pIdx => $parentData) {
                $parent = Category::updateOrCreate(
                    ['slug' => $parentData['id']],
                    [
                        'name'            => $parentData['name'],
                        'parent_id'       => null,
                        'sort_order'      => $pIdx + 1,
                        'is_active'       => true,
                        'requires_fda'    => false,
                        'commission_rate' => null,
                    ]
                );

                foreach ($parentData['children'] as $cIdx => $childData) {
                    Category::updateOrCreate(
                        ['slug' => $childData['id']],
                        [
                            'name'            => $childData['name'],
                            'parent_id'       => $parent->id,
                            'sort_order'      => $cIdx + 1,
                            'is_active'       => true,
                            'requires_fda'    => $childData['requires_fda'] ?? false,
                            'commission_rate' => $childData['commission_rate'] ?? null,
                        ]
                    );
                }
            }
        });
    }
}
