<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The product description is rich text: the 1,500-character limit applies to the visible text (as the form counts
 * it), not to the HTML, whose tags and embedded image URLs would otherwise reject a short description.
 */
class SellerProductDescriptionTest extends TestCase
{
    use DatabaseTransactions;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->seller = User::forceCreate([
            'first_name' => 'Marco', 'last_name' => 'Santos', 'email' => 'seller.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
        SellerProfile::forceCreate([
            'user_id' => $this->seller->id, 'shop_name' => 'Shop ' . uniqid(), 'shop_category' => 'x', 'shop_description' => 'x',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => 'N/A',
            'government_id_number_hash' => hash('sha256', 'x' . $this->seller->id), 'government_id_image_path' => 'x.png',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'payout_gcash_number' => '09170000000', 'application_status' => 'approved', 'submitted_at' => now(),
        ]);
        Sanctum::actingAs($this->seller);
    }

    private function payload(string $description): array
    {
        return [
            'name' => 'Classic White Tee',
            'description' => $description,
            'status' => 'draft',
            'base_price' => 199,
            'variants' => [['label' => 'Default', 'price' => 199, 'stock' => 5]],
        ];
    }

    public function test_formatting_and_embedded_images_do_not_count_toward_the_limit(): void
    {
        $image = '<p><img src="https://api.loved-it.shop/storage/products/descriptions/' . str_repeat('a', 40) . '.jpg" alt=""></p>';
        $html = '<p><b>Soft cotton.</b></p><ul>' . str_repeat('<li>Comfortable everyday fit</li>', 40) . '</ul>' . str_repeat($image, 5);
        $this->assertGreaterThan(1500, strlen($html));
        $this->assertLessThanOrEqual(1500, mb_strlen(strip_tags($html)));

        $this->postJson('/api/v1/seller/products', $this->payload($html))->assertCreated();
        $this->assertSame($html, Product::where('seller_id', $this->seller->id)->latest('id')->value('description'));
    }

    public function test_visible_text_over_1500_characters_is_rejected_on_create_and_update(): void
    {
        $tooLong = '<p>' . str_repeat('x', 1501) . '</p>';

        $this->postJson('/api/v1/seller/products', $this->payload($tooLong))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['description' => 'Description must not exceed 1,500 characters.']);

        $id = $this->postJson('/api/v1/seller/products', $this->payload('<p>Short</p>'))->assertCreated()->json('data.id');
        $this->postJson("/api/v1/seller/products/{$id}", $this->payload($tooLong))
            ->assertStatus(422)->assertJsonValidationErrors(['description']);
        $this->postJson("/api/v1/seller/products/{$id}", $this->payload('<p><b>' . str_repeat('y', 1500) . '</b></p>'))
            ->assertOk();
    }
}
