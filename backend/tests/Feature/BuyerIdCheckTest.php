<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * A buyer places orders only once an admin approved their government ID. Before that they can sign in (with a password
 * or Google), browse and fill a cart; any buyer can send an ID from their account, and send a new one if it was not
 * approved.
 */
class BuyerIdCheckTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('local');
        Mail::fake();
    }

    private function shopper(?string $idStatus, ?string $reason = null): User
    {
        $user = $this->buyer();
        $user->forceFill(['buyer_application_status' => $idStatus, 'buyer_rejection_reason' => $reason])->save();

        return $user;
    }

    public function test_checkout_waits_for_an_approved_id(): void
    {
        $cases = [
            [null, 'none', 'Add a government ID'],
            ['pending', 'pending', 'still being checked'],
            ['rejected', 'rejected', 'The photo is blurry'],
        ];
        foreach ($cases as [$status, $idStatus, $words]) {
            Sanctum::actingAs($this->shopper($status, $status === 'rejected' ? 'The photo is blurry' : null));
            $res = $this->postJson('/api/v1/checkout/place-order', ['payment_method' => 'cod'])->assertForbidden()
                ->assertJsonPath('code', 'id_not_verified')->assertJsonPath('id_status', $idStatus);
            $this->assertStringContainsString($words, $res->json('message'));
        }

        // An approved buyer gets past the ID check (and on to the normal checkout rules).
        Sanctum::actingAs($this->shopper('approved'));
        $this->postJson('/api/v1/checkout/place-order', ['payment_method' => 'cod'])->assertJsonMissing(['code' => 'id_not_verified']);
    }

    public function test_a_buyer_sends_an_id_and_sends_a_new_one_after_a_rejection(): void
    {
        $admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::random(6) . '@example.com', 'password' => 'x', 'role' => 'admin', 'status' => 'active']);
        $buyer = $this->shopper(null);
        Sanctum::actingAs($buyer);

        $this->getJson('/api/v1/account/id-verification')->assertOk()->assertJsonPath('data.status', 'none')->assertJsonPath('data.can_order', false);
        $this->postJson('/api/v1/account/id-verification', ['government_id_type' => 'umid'])->assertStatus(422)->assertJsonValidationErrors('government_id_image');

        $this->post('/api/v1/account/id-verification', [
            'government_id_type' => 'passport', 'government_id_image' => UploadedFile::fake()->create('passport.jpg', 300, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.status', 'pending');
        $this->assertSame('pending', $buyer->fresh()->buyer_application_status);
        $this->assertTrue($admin->notifications()->where('data->kind', 'buyer.id_submitted')->exists());
        // Waiting: it cannot be sent twice.
        $this->post('/api/v1/account/id-verification', [
            'government_id_type' => 'passport', 'government_id_image' => UploadedFile::fake()->create('again.jpg', 300, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertStatus(409);

        // The admin rejects it; the buyer sends a new one and it goes back to the queue.
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/buyer-applications/{$buyer->id}/reject", ['reason' => 'The photo is blurry.'])->assertOk();
        Sanctum::actingAs($buyer->fresh());
        $this->getJson('/api/v1/account/id-verification')->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.reason', 'The photo is blurry.');
        $this->post('/api/v1/account/id-verification', [
            'government_id_type' => 'passport', 'government_id_image' => UploadedFile::fake()->create('clear.jpg', 300, 'image/jpeg'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame('pending', $buyer->fresh()->buyer_application_status);
        $this->assertNull($buyer->fresh()->buyer_rejection_reason);

        // Approved: orders open.
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/buyer-applications/{$buyer->id}/approve")->assertOk();
        Sanctum::actingAs($buyer->fresh());
        $this->getJson('/api/v1/account/id-verification')->assertJsonPath('data.can_order', true);
    }

    public function test_a_google_buyer_waiting_for_the_id_check_can_still_sign_in(): void
    {
        $buyer = $this->shopper('pending');
        $buyer->forceFill(['date_of_birth' => '1999-02-02', 'sex' => 'male', 'government_id_type' => 'umid'])->save();
        Http::fake(['https://www.googleapis.com/*' => Http::response(['email' => $buyer->email, 'given_name' => 'Juan', 'family_name' => 'Dela Cruz'])]);

        $this->postJson('/api/v1/auth/google', ['credential' => 'google-access-token'])->assertOk()->assertJsonStructure(['token']);
    }
}
