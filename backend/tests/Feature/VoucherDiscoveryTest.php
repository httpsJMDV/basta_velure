<?php

namespace Tests\Feature;

use App\Models\Voucher;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

class VoucherDiscoveryTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    public function test_discovery_includes_unsaved_shop_and_platform_offers_but_not_private_or_unavailable_ones(): void
    {
        $seller = $this->seller('Discoverable shop', $this->qc);
        [$product] = $this->product($seller, 'Offer item', ['Default' => [100, 10]], 0.1);
        $shop = $this->voucher($this->code('SHOP'), Voucher::SCOPE_STORE, $seller, 'fixed', 10, 50);
        $platform = $this->voucher($this->code('PLAT'), Voucher::SCOPE_PLATFORM, null, 'fixed', 10, 50);
        $shipping = $this->voucher($this->code('SHIP'), Voucher::SCOPE_SHIPPING, null, 'fixed', 10, 50);
        $excluded = [];
        foreach ([
            ['claimable' => false], ['starts_at' => now()->addDay()], ['ends_at' => now()->subMinute()],
            ['ended_at' => now()], ['total_limit' => 1, 'used_count' => 1], ['applies_to' => 'products'],
        ] as $extra) {
            $excluded[] = $this->voucher($this->code('HIDE'), Voucher::SCOPE_STORE, $seller, 'fixed', 10, 50, $extra)->id;
        }
        $limited = $this->voucher($this->code('ITEM'), Voucher::SCOPE_STORE, $seller, 'fixed', 10, 50, ['applies_to' => 'products']);
        $limited->products()->attach($product);
        $rows = $this->getJson('/api/v1/vouchers/discover')->assertOk()->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'total']])->json('data');
        $ids = array_column($rows, 'id');
        foreach ([$shop, $platform, $shipping, $limited] as $offer) {
            $this->assertContains($offer->id, $ids);
        }
        foreach ($excluded as $id) {
            $this->assertNotContains($id, $ids);
        }
        $row = collect($rows)->firstWhere('id', $shop->id);
        $this->assertSame($seller->sellerProfile->shop_name, $row['seller']['shop_name']);
        $this->assertFalse($row['claimed']);
    }

    public function test_discovery_does_not_advertise_suspended_unapproved_vacation_or_empty_shops(): void
    {
        $hidden = [];
        foreach (['suspended', 'pending', 'vacation', 'inactive_product'] as $reason) {
            $seller = $this->seller('Hidden shop', $this->qc);
            [$product] = $this->product($seller, 'Hidden item', ['Default' => [100, 10]], 0.1);
            if ($reason === 'suspended') {
                $seller->forceFill(['status' => 'suspended'])->save();
            } elseif ($reason === 'pending') {
                $seller->sellerProfile->update(['application_status' => 'pending']);
            } elseif ($reason === 'vacation') {
                $seller->sellerProfile->update(['on_vacation' => true]);
            } else {
                $product->update(['status' => 'draft']);
            }
            $hidden[] = $this->voucher($this->code('HIDE'), Voucher::SCOPE_STORE, $seller, 'fixed', 10, 50)->id;
        }
        $ids = array_column($this->getJson('/api/v1/vouchers/discover')->assertOk()->json('data'), 'id');
        foreach ($hidden as $id) {
            $this->assertNotContains($id, $ids);
        }
    }

    public function test_discovery_is_paginated_and_claiming_an_offer_updates_the_wallet_and_claim_flag(): void
    {
        $buyer = $this->buyer();
        for ($i = 0; $i < 25; $i++) {
            $offer = $this->voucher($this->code('PAGE'), Voucher::SCOPE_PLATFORM, null, 'fixed', 10, 50);
        }
        $first = $this->getJson('/api/v1/vouchers/discover')->assertOk()->json();
        $second = $this->getJson('/api/v1/vouchers/discover?page=2')->assertOk()->json();
        $this->assertCount(24, $first['data']);
        $this->assertSame(2, $second['meta']['current_page']);
        $this->assertEmpty(array_intersect(array_column($first['data'], 'id'), array_column($second['data'], 'id')));
        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/buyer/vouchers/claim', ['voucher_id' => $offer->id])->assertCreated();
        $this->getJson('/api/v1/buyer/vouchers')->assertOk()->assertJsonFragment(['id' => $offer->id, 'claimed' => true]);
        $this->getJson('/api/v1/vouchers/discover?page=2')->assertOk()->assertJsonFragment(['id' => $offer->id, 'claimed' => true]);
    }
}
