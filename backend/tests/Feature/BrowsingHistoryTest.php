<?php

namespace Tests\Feature;

use App\Services\Catalog\BrowsingHistory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/** Recently viewed and recent searches: written by opening a product and searching while signed in; guests leave none. */
class BrowsingHistoryTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    public function test_opening_products_fills_recently_viewed_newest_first(): void
    {
        $buyer = $this->buyer();
        $seller = $this->seller('Habi Weaves', $this->qc);
        [$mat] = $this->product($seller, 'Banig Mat', ['Default' => [300, 5]], 1);
        [$hat] = $this->product($seller, 'Buri Hat', ['Default' => [150, 5]], 0.2);

        Sanctum::actingAs($buyer);
        $this->getJson("/api/v1/products/{$mat->id}")->assertOk();
        $this->travel(1)->seconds();
        $this->getJson("/api/v1/products/{$hat->id}")->assertOk();
        $this->travel(1)->seconds();
        $this->getJson("/api/v1/products/{$mat->id}")->assertOk();

        $this->getJson('/api/v1/me/recently-viewed')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $mat->id)
            ->assertJsonPath('data.1.id', $hat->id);

        // A product taken down drops out.
        $hat->update(['status' => 'archived']);
        $this->getJson('/api/v1/me/recently-viewed')->assertOk()->assertJsonCount(1, 'data');

        $this->deleteJson('/api/v1/me/recently-viewed')->assertOk();
        $this->getJson('/api/v1/me/recently-viewed')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_searches_are_kept_once_each_and_can_be_removed(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);

        $this->getJson('/api/v1/products?q=Rattan%20basket')->assertOk();
        $this->travel(1)->seconds();
        $this->getJson('/api/v1/products?q=banig')->assertOk();
        $this->travel(1)->seconds();
        $this->getJson('/api/v1/products?q=rattan   BASKET')->assertOk();
        // A next page is not a new search.
        $this->getJson('/api/v1/products?q=lamp&page=2')->assertOk();

        $rows = $this->getJson('/api/v1/me/search-history')->assertOk()->json('data');
        $this->assertSame(['rattan basket', 'banig'], array_column($rows, 'query'));

        $this->deleteJson('/api/v1/me/search-history/' . $rows[1]['id'])->assertOk()->assertJsonCount(1, 'data');
        $this->deleteJson('/api/v1/me/search-history')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_guests_leave_no_history_and_old_entries_are_trimmed(): void
    {
        $this->getJson('/api/v1/products?q=banig')->assertOk();
        $this->assertSame(0, DB::table('search_histories')->where('query', 'banig')->count());
        $this->getJson('/api/v1/me/search-history')->assertUnauthorized();

        $buyer = $this->buyer();
        $history = app(BrowsingHistory::class);
        for ($i = 0; $i < BrowsingHistory::KEEP_SEARCHES + 5; $i++) {
            $this->travel(1)->seconds();
            $history->searched($buyer, "term {$i}");
        }
        $this->assertSame(BrowsingHistory::KEEP_SEARCHES, DB::table('search_histories')->where('user_id', $buyer->id)->count());
        $this->assertSame('term ' . (BrowsingHistory::KEEP_SEARCHES + 4), $history->searches($buyer)[0]['query']);
    }
}
