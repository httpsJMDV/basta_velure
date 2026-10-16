<?php

namespace Tests\Feature;

use App\Mail\BuyerApplicationMail;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Tests\Support\BuildsEscrowOrders;
use Tests\TestCase;

class BuyerApplicationEmailTest extends TestCase
{
    use BuildsEscrowOrders, DatabaseTransactions;

    public function test_approval_queues_confirmation_to_registered_buyer_only_once(): void
    {
        Mail::fake();
        $admin = $this->makeUser('admin');
        $buyer = $this->makeUser('buyer');
        $buyer->forceFill(['buyer_application_status' => 'pending'])->save();
        $url = "/api/v1/admin/buyer-applications/{$buyer->id}/approve";
        $this->actingAs($admin, 'sanctum')->postJson($url)->assertOk();
        $this->assertSame('approved', $buyer->fresh()->buyer_application_status);
        Mail::assertQueued(BuyerApplicationMail::class, fn ($mail) =>
            $mail->hasTo($buyer->email) && $mail->decision === 'approved' && $mail->afterCommit
        );
        $this->postJson($url)->assertStatus(422);
        Mail::assertQueuedCount(1);
    }

    public function test_email_contains_branding_safe_name_and_configured_login_url(): void
    {
        config(['app.frontend_url' => 'https://shop.example.com/']);
        $mail = new BuyerApplicationMail(new User(['first_name' => '<Buyer>']), 'approved');
        $mail->assertSeeInHtml('https://shop.example.com/login');
        $mail->assertSeeInHtml('#C0001A');
        $mail->assertSeeInHtml('alt="Loved-IT"', false);
        $mail->assertSeeInHtml('&lt;Buyer&gt;', false);
        $mail->assertSeeInText('approved');
        $mail->assertSeeInText('https://shop.example.com/login');
    }

    public function test_rejection_escapes_feedback_and_omits_approval_button(): void
    {
        $mail = new BuyerApplicationMail(new User(['first_name' => 'Buyer']), 'rejected', '<script>alert(1)</script>');
        $mail->assertSeeInHtml('&lt;script&gt;', false);
        $mail->assertDontSeeInHtml('Sign in to Loved-IT');
        $mail->assertSeeInText('unable to approve');
    }
}
