<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\HubApplicationReviewer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Account decisions on the logistics side are emailed, not only shown in the bell. */
class LogisticsEmailsTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $tag, string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => ucfirst($tag), 'last_name' => 'Ramos', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63918' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'male', 'role' => $role, 'status' => 'active',
        ]);
    }

    /** @return array{0: LogisticsCompany, 1: User, 2: SortingCenter} */
    private function network(): array
    {
        $code = strtoupper(substr(uniqid(), -6));
        $company = LogisticsCompany::create(['name' => 'Mail Co ' . $code, 'code' => $code, 'slug' => strtolower($code), 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now()]);
        $ops = $this->user('ops');
        LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $ops->id, 'role' => 'owner']);
        $hub = SortingCenter::forceCreate([
            'user_id' => $this->user('hub')->id, 'hub_name' => 'Mail Hub ' . $code, 'address_province' => 'Laguna', 'address_city' => 'Pila',
            'address_barangay' => 'Real', 'address_street' => '1 St', 'status' => SortingCenter::STATUS_APPROVED, 'coverage_barangays' => ['0403424001'],
            'logistics_company_id' => $company->id,
        ]);

        return [$company, $ops, $hub];
    }

    private function sentKinds(string $email): array
    {
        $kinds = [];
        Mail::assertQueued(NoticeMail::class, function (NoticeMail $mail) use ($email, &$kinds) {
            if ($mail->hasTo($email)) {
                $kinds[] = $mail->kind;
            }

            return true;
        });

        return $kinds;
    }

    public function test_the_hub_owner_is_emailed_when_the_hub_is_suspended_and_reactivated(): void
    {
        Mail::fake();
        [, $ops, $hub] = $this->network();

        app(HubApplicationReviewer::class)->suspend($hub, $ops, 'Parcels were left out in the rain twice.');
        app(HubApplicationReviewer::class)->reactivate($hub->fresh(), $ops);

        $kinds = $this->sentKinds($hub->user->email);
        $this->assertContains('hub_suspended', $kinds);
        $this->assertContains('hub_reactivated', $kinds);
    }

    public function test_a_rider_is_emailed_when_the_courier_suspends_and_reactivates_them(): void
    {
        Mail::fake();
        [$company, $ops, $hub] = $this->network();
        $rider = Rider::forceCreate([
            'user_id' => $this->user('rider', 'rider')->id, 'logistics_company_id' => $company->id, 'sorting_center_id' => $hub->id,
            'vehicle_type' => 'Motorcycle', 'plate_number' => 'ML' . random_int(1000, 9999), 'status' => Rider::STATUS_ACTIVE, 'activated_at' => now(),
        ])->fresh(['user']);

        Sanctum::actingAs($ops->fresh());
        $this->postJson("/api/v1/logistics/riders/{$rider->id}/suspend", ['reason' => 'Several missed pickups this week.'])->assertOk();
        $this->postJson("/api/v1/logistics/riders/{$rider->id}/reactivate")->assertOk();

        $kinds = $this->sentKinds($rider->user->email);
        $this->assertContains('rider_suspended', $kinds);
        $this->assertContains('rider_reactivated', $kinds);
    }
}
