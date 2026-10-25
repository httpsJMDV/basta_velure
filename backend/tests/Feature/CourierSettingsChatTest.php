<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The courier portal's Settings (company contact details and logo) and Messages (one thread with each of its hubs,
 * answered from the hub's Messages page), Amaru task 2.
 */
class CourierSettingsChatTest extends TestCase
{
    use DatabaseTransactions;

    private LogisticsCompany $company;
    private User $ops;
    private User $hubLead;
    private SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Storage::fake('public');

        $this->company = $this->company('Bilis Hatid Express');
        $this->ops = $this->person('Carlos');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->ops->id, 'role' => 'owner']);
        $this->hubLead = $this->person('Hub');
        $this->hub = $this->hub($this->company, $this->hubLead);
    }

    protected function tearDown(): void
    {
        foreach ([$this->ops->id, $this->hubLead->id] as $id) {
            RateLimiter::clear('courier-chat-send:' . $id);
        }
        parent::tearDown();
    }

    private function person(string $first): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Reyes', 'email' => Str::lower($first) . '.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Hatid@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    private function company(string $name): LogisticsCompany
    {
        return LogisticsCompany::create([
            'name' => $name . ' ' . Str::random(4), 'slug' => Str::slug($name) . '-' . Str::lower(Str::random(6)), 'code' => 'C' . Str::upper(Str::random(5)),
            'contact_email' => 'ops' . Str::random(5) . '@example.com', 'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'is_default' => false,
        ]);
    }

    private function hub(LogisticsCompany $company, User $lead, string $status = SortingCenter::STATUS_APPROVED): SortingCenter
    {
        return SortingCenter::create([
            'logistics_company_id' => $company->id, 'user_id' => $lead->id, 'hub_name' => 'QC Hub ' . Str::random(3),
            'address_province' => 'Metro Manila', 'address_city' => 'Quezon City', 'address_barangay' => 'Central', 'address_street' => '1 Hub St',
            'status' => $status, 'coverage_barangays' => ['137404001'],
        ]);
    }

    public function test_the_company_edits_its_contact_details_and_logo_but_not_its_reviewed_details(): void
    {
        Sanctum::actingAs($this->ops);
        $name = $this->company->name;

        $this->patchJson('/api/v1/logistics/company', ['contact_email' => 'Dispatch@Bilis.PH', 'contact_phone' => '0917 123 4567', 'description' => '<b>Same-day</b> in Metro Manila', 'name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('data.contact_email', 'dispatch@bilis.ph')
            ->assertJsonPath('data.description', 'Same-day in Metro Manila')
            ->assertJsonPath('data.name', $name);
        $this->assertSame('+639171234567', $this->company->fresh()->contact_phone);

        $this->patchJson('/api/v1/logistics/company', ['contact_email' => 'not-an-email', 'contact_phone' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors(['contact_email', 'contact_phone']);

        $url = $this->postJson('/api/v1/logistics/company/logo', ['logo' => UploadedFile::fake()->image('logo.png', 200, 200)])
            ->assertOk()->json('data.logo_url');
        $this->assertNotNull($url);
        Storage::disk('public')->assertExists($this->company->fresh()->logo_path);
        $this->postJson('/api/v1/logistics/company/logo', ['logo' => UploadedFile::fake()->create('logo.pdf', 10, 'application/pdf')])->assertStatus(422);

        // Someone outside the company team cannot.
        Sanctum::actingAs($this->hubLead);
        $this->patchJson('/api/v1/logistics/company', ['contact_email' => 'x@example.com', 'contact_phone' => '09171234567'])->assertForbidden();
    }

    public function test_the_courier_and_its_hub_message_each_other_with_unread_counts(): void
    {
        Sanctum::actingAs($this->ops);
        $this->getJson('/api/v1/logistics/chat/hubs')->assertOk()->assertJsonPath('data.0.hub.id', $this->hub->id)->assertJsonPath('data.0.thread_id', null);

        $id = $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->assertCreated()->json('data.id');
        $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->assertOk()->assertJsonPath('data.id', $id);
        $this->postJson("/api/v1/logistics/chat/threads/{$id}/messages", ['body' => 'Short on riders today?'])->assertCreated()
            ->assertJsonPath('data.sender_role', 'courier');

        // The hub sees the same thread, with one unread message from its courier.
        Sanctum::actingAs($this->hubLead);
        $this->getJson('/api/v1/hub/courier-chat')->assertOk()->assertJsonPath('data.id', $id)->assertJsonPath('data.unread', 1)
            ->assertJsonPath('data.company.name', $this->company->name);
        $this->getJson('/api/v1/hub/courier-chat/messages')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.can_send', true);
        $this->postJson('/api/v1/hub/courier-chat/read')->assertOk();
        $this->postJson('/api/v1/hub/courier-chat/messages', ['body' => 'Two riders out sick.'])->assertCreated()->assertJsonPath('data.sender_role', 'hub');

        Sanctum::actingAs($this->ops);
        $this->getJson('/api/v1/logistics/chat/unread')->assertOk()->assertJsonPath('data.unread', 1);
        $this->getJson("/api/v1/logistics/chat/threads/{$id}/messages?after_id=0")->assertOk()->assertJsonCount(2, 'data');
        $this->postJson("/api/v1/logistics/chat/threads/{$id}/read")->assertOk();
        $this->getJson('/api/v1/logistics/chat/unread')->assertJsonPath('data.unread', 0);
        $this->assertSame(0, Conversation::find($id)->hub_unread);
    }

    public function test_threads_are_private_and_a_suspended_hub_is_read_only(): void
    {
        Sanctum::actingAs($this->ops);
        $id = $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->json('data.id');

        // Another courier cannot open it or start a thread with a hub that is not theirs.
        $other = $this->company('Mabilis Padala');
        $otherOps = $this->person('Ana');
        LogisticsCompanyMember::create(['logistics_company_id' => $other->id, 'user_id' => $otherOps->id, 'role' => 'owner']);
        Sanctum::actingAs($otherOps);
        $this->getJson("/api/v1/logistics/chat/threads/{$id}/messages")->assertNotFound();
        $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->assertNotFound();

        // The admin's inbox and the general conversation endpoints do not reach it.
        $admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::random(6) . '@example.com', 'password' => 'x', 'role' => 'admin', 'status' => 'active']);
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/conversations/{$id}/messages")->assertNotFound();
        $this->assertNotContains($id, collect($this->getJson('/api/v1/admin/conversations')->json('data'))->pluck('id'));

        // A suspended hub's thread stays readable but takes no new messages.
        $this->hub->update(['status' => SortingCenter::STATUS_SUSPENDED]);
        Sanctum::actingAs($this->ops);
        $this->getJson("/api/v1/logistics/chat/threads/{$id}/messages")->assertOk()->assertJsonPath('meta.is_closed', true);
        $this->postJson("/api/v1/logistics/chat/threads/{$id}/messages", ['body' => 'Hello?'])->assertStatus(409);
        $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->assertOk()->assertJsonPath('data.id', $id)->assertJsonPath('data.meta.can_send', false);
        // A suspended hub with no thread yet cannot be messaged.
        $quiet = $this->hub($this->company, $this->person('Lito'), SortingCenter::STATUS_SUSPENDED);
        $this->postJson("/api/v1/logistics/chat/hubs/{$quiet->id}/thread")->assertStatus(409);
    }

    public function test_a_message_is_1_to_1000_characters(): void
    {
        Sanctum::actingAs($this->ops);
        $id = $this->postJson("/api/v1/logistics/chat/hubs/{$this->hub->id}/thread")->json('data.id');

        $this->postJson("/api/v1/logistics/chat/threads/{$id}/messages", ['body' => '   '])->assertStatus(422)->assertJsonPath('errors.body.0', 'Write a message first.');
        $this->postJson("/api/v1/logistics/chat/threads/{$id}/messages", ['body' => str_repeat('a', 1001)])->assertStatus(422);
        $this->postJson("/api/v1/logistics/chat/threads/{$id}/messages", ['body' => '<script>x</script>Parcel LIT-1 is at intake'])->assertCreated()
            ->assertJsonPath('data.body', 'xParcel LIT-1 is at intake');
    }
}
