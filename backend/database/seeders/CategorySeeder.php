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
                ],
            ],
            [
                'id' => 'pet-supplies',
                'name' => 'Pet Supplies',
                'children' => [
                    ['id' => 'pet-food', 'name' => 'Pet Food'],
                    ['id' => 'pet-accessories', 'name' => 'Pet Accessories'],
                    ['id' => 'pet-health-grooming', 'name' => 'Pet Health & Grooming'],
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
