<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $tree = [
            ['slug' => 'mobile-gadgets-computers', 'name' => 'Mobile, Gadgets & Computers', 'children' => [
                ['slug' => 'smartphones',       'name' => 'Smartphones'],
                ['slug' => 'laptops',            'name' => 'Laptops'],
                ['slug' => 'earphones-audio',    'name' => 'Earphones & Audio'],
                ['slug' => 'chargers-powerbanks','name' => 'Chargers & Powerbanks'],
                ['slug' => 'phone-accessories',  'name' => 'Phone Accessories'],
            ]],
            ['slug' => 'home-appliances', 'name' => 'Home Appliances', 'children' => [
                ['slug' => 'refrigerators',          'name' => 'Refrigerators'],
                ['slug' => 'electric-fans',           'name' => 'Electric Fans'],
                ['slug' => 'air-conditioners',        'name' => 'Air Conditioners'],
                ['slug' => 'washing-machines',        'name' => 'Washing Machines'],
                ['slug' => 'rice-cookers-kitchen',    'name' => 'Rice Cookers & Kitchen Appliances'],
            ]],
            ['slug' => 'home-living', 'name' => 'Home & Living', 'children' => [
                ['slug' => 'furniture',            'name' => 'Furniture'],
                ['slug' => 'home-decor',           'name' => 'Home Decor'],
                ['slug' => 'bedding-linens',       'name' => 'Bedding & Linens'],
                ['slug' => 'kitchenware',          'name' => 'Kitchenware'],
                ['slug' => 'storage-organization', 'name' => 'Storage & Organization'],
            ]],
            ['slug' => 'home-improvement-tools', 'name' => 'Home Improvement & Tools', 'children' => [
                ['slug' => 'hand-tools',       'name' => 'Hand Tools'],
                ['slug' => 'power-tools',      'name' => 'Power Tools'],
                ['slug' => 'hardware',         'name' => 'Hardware'],
                ['slug' => 'lighting',         'name' => 'Lighting'],
                ['slug' => 'plumbing-supplies','name' => 'Plumbing Supplies'],
            ]],
            ['slug' => 'automotive-motorcycle', 'name' => 'Automotive & Motorcycle', 'children' => [
                ['slug' => 'car-accessories',   'name' => 'Car Accessories'],
                ['slug' => 'motorcycle-parts',  'name' => 'Motorcycle Parts'],
                ['slug' => 'helmets',           'name' => 'Helmets'],
                ['slug' => 'car-care',          'name' => 'Car Care'],
            ]],
            ['slug' => 'womens-fashion', 'name' => "Women's Fashion", 'children' => [
                ['slug' => 'womens-tops',      'name' => 'Tops'],
                ['slug' => 'dresses',          'name' => 'Dresses'],
                ['slug' => 'womens-bottoms',   'name' => 'Bottoms'],
                ['slug' => 'womens-outerwear', 'name' => 'Outerwear'],
                ['slug' => 'womens-footwear',  'name' => 'Footwear'],
            ]],
            ['slug' => 'mens-fashion', 'name' => "Men's Fashion", 'children' => [
                ['slug' => 'shirts',         'name' => 'Shirts'],
                ['slug' => 'pants',          'name' => 'Pants'],
                ['slug' => 'mens-outerwear', 'name' => 'Outerwear'],
                ['slug' => 'mens-footwear',  'name' => 'Footwear'],
            ]],
            ['slug' => 'bags-accessories', 'name' => 'Bags & Accessories', 'children' => [
                ['slug' => 'bags-wallets', 'name' => 'Bags & Wallets'],
                ['slug' => 'jewelry',      'name' => 'Jewelry'],
                ['slug' => 'watches',      'name' => 'Watches'],
                ['slug' => 'sunglasses',   'name' => 'Sunglasses'],
            ]],
            ['slug' => 'health-beauty', 'name' => 'Health & Beauty', 'children' => [
                ['slug' => 'skincare',      'name' => 'Skincare'],
                ['slug' => 'makeup',        'name' => 'Makeup'],
                ['slug' => 'personal-care', 'name' => 'Personal Care'],
                ['slug' => 'supplements',   'name' => 'Supplements'],
            ]],
            ['slug' => 'sports-outdoors', 'name' => 'Sports & Outdoors', 'children' => [
                ['slug' => 'fitness-equipment', 'name' => 'Fitness Equipment'],
                ['slug' => 'outdoor-gear',      'name' => 'Outdoor Gear'],
                ['slug' => 'sportswear',        'name' => 'Sportswear'],
                ['slug' => 'bicycles',          'name' => 'Bicycles'],
            ]],
            ['slug' => 'food-grocery', 'name' => 'Food & Grocery', 'children' => [
                ['slug' => 'snacks',         'name' => 'Snacks'],
                ['slug' => 'beverages',      'name' => 'Beverages'],
                ['slug' => 'fresh-produce',  'name' => 'Fresh Produce'],
                ['slug' => 'instant-meals',  'name' => 'Instant Meals'],
                ['slug' => 'pantry-staples', 'name' => 'Pantry Staples'],
            ]],
            ['slug' => 'baby-kids', 'name' => 'Baby & Kids', 'children' => [
                ['slug' => 'baby-gear',       'name' => 'Baby Gear'],
                ['slug' => 'kids-clothing',   'name' => "Kids' Clothing"],
                ['slug' => 'feeding-nursing', 'name' => 'Feeding & Nursing'],
                ['slug' => 'diapers',         'name' => 'Diapers'],
            ]],
            ['slug' => 'toys-hobbies-books', 'name' => 'Toys, Hobbies & Books', 'children' => [
                ['slug' => 'toys',                 'name' => 'Toys'],
                ['slug' => 'collectibles-hobbies', 'name' => 'Collectibles & Hobbies'],
                ['slug' => 'books',                'name' => 'Books'],
                ['slug' => 'stationery',           'name' => 'Stationery'],
            ]],
            ['slug' => 'pet-supplies', 'name' => 'Pet Supplies', 'children' => [
                ['slug' => 'pet-food',             'name' => 'Pet Food'],
                ['slug' => 'pet-accessories',      'name' => 'Pet Accessories'],
                ['slug' => 'pet-health-grooming',  'name' => 'Pet Health & Grooming'],
            ]],
        ];

        $now = now();

        foreach ($tree as $sort => $parent) {
            $parentId = DB::table('categories')->insertGetId([
                'slug'       => $parent['slug'],
                'name'       => $parent['name'],
                'parent_id'  => null,
                'sort_order' => $sort,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            foreach ($parent['children'] as $childSort => $child) {
                DB::table('categories')->insert([
                    'slug'       => $child['slug'],
                    'name'       => $child['name'],
                    'parent_id'  => $parentId,
                    'sort_order' => $childSort,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
}
