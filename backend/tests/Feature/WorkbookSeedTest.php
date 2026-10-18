<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\Product;
use App\Models\Rider;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * `php artisan workbook:seed` builds the workbooks' Test Data sheet, can run twice without duplicating anything, and
 * the seeded records reproduce the worked checkout example exactly.
 */
class WorkbookSeedTest extends TestCase
{
    use DatabaseTransactions;

    public function test_the_seed_matches_the_test_data_sheet_and_the_worked_example(): void
    {
        $this->artisan('workbook:seed', ['--force' => true])->assertSuccessful();
        $counts = [User::count(), Product::count(), Voucher::count(), Address::count(), Rider::count()];
        $this->artisan('workbook:seed', ['--force' => true])->assertSuccessful();
        $this->assertSame($counts, [User::count(), Product::count(), Voucher::count(), Address::count(), Rider::count()]);

        $buyer = User::where('email', 'juanmiguel.delacruz@example.com')->firstOrFail();
        $s1 = User::where('email', 'mariaclara.santos@example.com')->firstOrFail();
        $s2 = User::where('email', 'roberto.villanueva@example.com')->firstOrFail();
        $this->assertSame('approved', $s1->sellerProfile->application_status);
        $this->assertSame('pending', User::where('email', 'seller.test01@example.com')->first()->sellerProfile->application_status);
        $this->assertSame(Rider::STATUS_SUSPENDED, Rider::whereHas('user', fn ($q) => $q->where('email', 'rider.test01@example.com'))->value('status'));
        $this->assertCount(3, Address::where('user_id', $buyer->id)->get()->unique('address')); // ADDR-1, ADDR-2 and ADDR-4
        $this->assertSame(6, Product::where('seller_id', $s1->id)->where('name', 'Abaca Woven Tote Bag')->first()->variants()->count());
        $this->assertSame(2, Product::where('seller_id', $s2->id)->where('name', 'Power Bank 10000mAh')->value('purchase_limit'));

        $variant = fn (User $seller, string $product, string $label) => Product::where('seller_id', $seller->id)->where('name', $product)->first()->variants()->where('label', $label)->firstOrFail();
        $addr1 = Address::where('user_id', $buyer->id)->where('address', '45 Kalayaan Ave.')->firstOrFail();
        Sanctum::actingAs($buyer);
        $quote = $this->postJson('/api/v1/checkout/quote', [
            'address_id' => $addr1->id,
            'items' => [
                ['variant_id' => $variant($s1, 'Abaca Woven Tote Bag', 'Natural / M')->id, 'quantity' => 1],
                ['variant_id' => $variant($s1, 'Rattan Fruit Basket', 'Default')->id, 'quantity' => 1],
                ['variant_id' => $variant($s2, 'USB-C Fast Charger 20W', 'Default')->id, 'quantity' => 1],
            ],
            'vouchers' => ['store' => [$s1->id => 'MCH50'], 'platform' => 'PLAT100', 'shipping' => 'FREESHIP'],
        ])->assertOk()->json('data');

        $this->assertTrue($quote['can_place']);
        $this->assertEqualsWithDelta(1098.00, $quote['totals']['merchandise'], 0.001);
        $this->assertEqualsWithDelta(185.00, $quote['totals']['shipping'], 0.001);
        $this->assertEqualsWithDelta(1083.00, $quote['totals']['total'], 0.001);

        // ADDR-4 (Itbayat, Batanes) is outside every zone.
        $addr4 = Address::where('user_id', $buyer->id)->where('address', 'Purok 2')->firstOrFail();
        $far = $this->postJson('/api/v1/checkout/quote', [
            'address_id' => $addr4->id, 'items' => [['variant_id' => $variant($s1, 'Rattan Fruit Basket', 'Default')->id, 'quantity' => 1]],
        ])->assertOk()->json('data');
        $this->assertFalse($far['can_place']);
    }
}
