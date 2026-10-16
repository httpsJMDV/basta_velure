<?php

namespace Tests\Feature;

use App\Mail\{WelcomeMail, SellerApplicationMail, PasswordResetMail, RiderApplicationMail, SortingCenterApplicationMail, ParcelsAssignedMail, ParcelReturnedMail};
use App\Models\{User, SellerProfile, SortingCenter};
use Tests\TestCase;

class BrandedEmailsTest extends TestCase
{
    public function test_all_transactional_templates_have_matching_branding_plain_text_and_correct_content(): void
    {
        config(['app.frontend_url' => 'https://shop.example.test/']);
        $user = new User(['first_name' => '<Alex>', 'last_name' => 'Buyer']);
        $user->setRelation('sellerProfile', new SellerProfile(['shop_name' => 'Sample Shop']));
        $hub = new SortingCenter(['hub_name' => 'Sample Hub']);
        $cases = [
            [new WelcomeMail($user), 'Welcome to Loved-IT.', '/login'],
            [new SellerApplicationMail($user), 'Sample Shop', '/login'],
            [new PasswordResetMail('<Alex>', 'https://shop.example.test/reset-password?token=test&email=test%40example.test'), '60 minutes', '/reset-password?token=test&email=test%40example.test'],
            [new RiderApplicationMail($user, 'approved', null, $hub), 'You are ready to ride.', '/rider/login'],
            [new RiderApplicationMail($user, 'disapproved', '<script>feedback</script>', $hub), 'Not approved', null],
            [new SortingCenterApplicationMail($user, 'approved', null, $hub), 'Your hub is approved.', '/hub/login'],
            [new SortingCenterApplicationMail($user, 'rejected', '<script>feedback</script>', $hub), 'Not approved', null],
            [new ParcelsAssignedMail($user, $hub, 2, 'Sample Area'), '2 parcels', '/rider/login'],
            [new ParcelReturnedMail($user, $hub, 'Sample Shop', 'ORDER-123', 'TRACK-123', 'Delivery failed'), 'TRACK-123', '/login'],
        ];
        foreach ($cases as [$mail, $content, $path]) {
            $mail->assertSeeInHtml('#C0001A');
            $mail->assertSeeInHtml('alt="Loved-IT"', false);
            $mail->assertSeeInHtml('&lt;Alex&gt;', false);
            $mail->assertSeeInHtml($content);
            $mail->assertSeeInText($content);
            $mail->assertSeeInText('The Loved-IT Team');
            if ($path !== null) {
                $mail->assertSeeInHtml('https://shop.example.test' . $path);
                $mail->assertSeeInText('https://shop.example.test' . $path);
            } else {
                $mail->assertSeeInHtml('&lt;script&gt;feedback&lt;/script&gt;', false);
                $mail->assertDontSeeInHtml('<script>', false);
                $mail->assertDontSeeInHtml('href=');
            }
        }
    }
}
