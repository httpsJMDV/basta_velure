<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * An admin can give any category its own photo (it replaces the built-in picture on the storefront) and remove it
 * again. Only admins can, and only images up to 5 MB.
 */
class CategoryPhotoTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        $this->admin = User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => 'admin.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']);
        $this->category = Category::forceCreate(['slug' => 'photo-test-' . Str::lower(Str::random(6)), 'name' => 'Photo Test ' . Str::random(4), 'is_active' => true, 'sort_order' => 1]);
    }

    private function upload(string $name = 'cover.jpg', int $kb = 400)
    {
        return $this->post("/api/v1/admin/categories/{$this->category->id}/photo",
            ['photo' => UploadedFile::fake()->create($name, $kb, match (pathinfo($name, PATHINFO_EXTENSION)) {
                'png' => 'image/png', 'pdf' => 'application/pdf', default => 'image/jpeg',
            })],
            ['Accept' => 'application/json']);
    }

    private function storefrontPhoto(): ?string
    {
        Cache::forget('storefront.categories');
        $node = collect($this->getJson('/api/v1/categories')->assertOk()->json('data'))->firstWhere('slug', $this->category->slug);

        return $node['photo_url'] ?? null;
    }

    public function test_the_admin_sets_a_photo_replaces_it_and_goes_back_to_the_default(): void
    {
        Sanctum::actingAs($this->admin);

        $first = $this->upload()->assertOk()->json('data.photo_url');
        $this->assertNotNull($first);
        $firstPath = $this->category->fresh()->image_path;
        Storage::disk('public')->assertExists($firstPath);
        $this->assertSame($first, $this->storefrontPhoto());

        // A new photo replaces the old file.
        $second = $this->upload('cover.png')->assertOk()->json('data.photo_url');
        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($firstPath);

        // In the admin list too, without the file path itself.
        $row = collect($this->getJson('/api/v1/admin/categories')->assertOk()->json('data'))->firstWhere('id', $this->category->id);
        $this->assertSame($second, $row['photo_url']);
        $this->assertArrayNotHasKey('image_path', $row);

        // Back to the default picture.
        $secondPath = $this->category->fresh()->image_path;
        $this->deleteJson("/api/v1/admin/categories/{$this->category->id}/photo")->assertOk()->assertJsonPath('data.photo_url', null);
        Storage::disk('public')->assertMissing($secondPath);
        $this->assertNull($this->storefrontPhoto());
    }

    public function test_only_images_up_to_5_mb_and_only_admins(): void
    {
        Sanctum::actingAs($this->admin);
        $this->upload('notes.pdf')->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->upload('huge.jpg', 6000)->assertStatus(422)->assertJsonValidationErrors('photo');
        $this->post("/api/v1/admin/categories/{$this->category->id}/photo", [], ['Accept' => 'application/json'])->assertStatus(422);

        $buyer = User::forceCreate(['first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => 'buyer.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('x'), 'role' => 'buyer', 'status' => 'active']);
        Sanctum::actingAs($buyer);
        $this->upload()->assertForbidden();
        $this->assertNull($this->category->fresh()->image_path);
    }
}
