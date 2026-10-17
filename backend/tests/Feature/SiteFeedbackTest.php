<?php

namespace Tests\Feature;

use App\Models\SiteFeedback;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Feedback about the site: a signed-in user sends it, only the admin reads it and marks it read. */
class SiteFeedbackTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => $role . '.' . uniqid() . '@example.com',
            'phone' => '0917' . random_int(1000000, 9999999), 'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    public function test_a_signed_in_user_sends_feedback_and_a_guest_cannot(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->postJson('/api/v1/feedback', ['message' => 'Hello'])->assertUnauthorized();

        $buyer = $this->user();
        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/feedback', ['message' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['message']);
        $this->postJson('/api/v1/feedback', ['message' => '  The checkout button is hard to find on mobile.  ', 'page_url' => 'https://loved-it.shop/cart'])->assertCreated();

        $row = SiteFeedback::where('user_id', $buyer->id)->sole();
        $this->assertSame('The checkout button is hard to find on mobile.', $row->message);
        $this->assertSame(SiteFeedback::STATUS_NEW, $row->status);
    }

    public function test_only_the_admin_lists_feedback_and_marks_it_read(): void
    {
        $buyer = $this->user();
        $feedback = SiteFeedback::create(['user_id' => $buyer->id, 'message' => 'Love the new design', 'status' => 'new']);

        Sanctum::actingAs($buyer);
        $this->getJson('/api/v1/admin/feedback')->assertForbidden();

        $admin = $this->user('admin');
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/feedback?status=new&search=new+design')->assertOk()
            ->assertJsonPath('data.0.id', $feedback->id)
            ->assertJsonPath('data.0.user.name', 'Ana Cruz')
            ->assertJsonPath('meta.counts.new', SiteFeedback::where('status', 'new')->count());

        $this->patchJson("/api/v1/admin/feedback/{$feedback->id}", ['status' => 'read'])->assertOk()->assertJsonPath('data.status', 'read');
        $this->assertSame($admin->id, $feedback->fresh()->read_by);
        $this->patchJson("/api/v1/admin/feedback/{$feedback->id}", ['status' => 'new'])->assertOk()->assertJsonPath('data.read_at', null);
    }
}
