<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Walks every API address and sends what a form never would: lists where a word belongs, huge numbers, and text where a
 * number belongs. A wrong request must get a clear refusal. A 500 means the server crashed on input someone can type.
 */
class MalformedInputTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private const STRANGE_QUERIES = [
        'q[]=a', 'search[]=a', 'sort[]=x', 'status[]=x', 'tab[]=x', 'filter[]=x', 'category[]=x', 'period[]=day', 'date[]=x',
        'page[]=1', 'per_page[]=1', 'view[]=x', 'from[]=x', 'to[]=x',
        'page=-1', 'per_page=-1', 'date=not-a-date', 'period=forever', 'from=not-a-date', 'to=not-a-date',
    ];

    /** Field names forms use, each sent as a list, as an object, and as a number too large for the database. */
    private const FIELDS = [
        'identifier', 'email', 'password', 'password_confirmation', 'token', 'code', 'name', 'first_name', 'last_name',
        'phone', 'body', 'message', 'comment', 'reason', 'note', 'quantity', 'variant_id', 'product_id', 'address_id',
        'payment_method', 'items', 'status', 'price', 'stock', 'rating', 'latitude', 'longitude', 'id_token', 'credential',
        'shop_name', 'description', 'title', 'label', 'expected_total', 'tracking_number', 'order_id', 'seller_ids',
    ];

    /** Routes that are not ours to test, or that do slow work on purpose. */
    private function skip(string $uri): bool
    {
        return str_contains($uri, 'broadcasting') || str_contains($uri, 'sanctum') || ! str_starts_with($uri, 'api/v1');
    }

    private function concreteUri(string $uri): string
    {
        return '/' . preg_replace('/\{[^}]+\}/', '1', $uri);
    }

    private function routesFor(string $method): array
    {
        $found = [];
        foreach (Route::getRoutes() as $route) {
            if (in_array($method, $route->methods(), true) && ! $this->skip($route->uri())) {
                $found[] = $route->uri();
            }
        }

        return array_values(array_unique($found));
    }

    private function user(string $tag = 'fuzz'): User
    {
        return User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => $tag . '.' . uniqid() . '@example.com', 'password' => Hash::make('Password123!'),
            'role' => 'buyer', 'status' => 'active', 'email_verified_at' => now(), 'buyer_application_status' => 'approved',
        ]);
    }

    private function assertNoCrashes(array $crashes): void
    {
        $this->assertSame([], array_values(array_unique($crashes)), count($crashes) . ' requests crashed the server');
    }

    protected function setUp(): void
    {
        parent::setUp();
        ini_set('memory_limit', '1G');
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Mail::fake();
    }

    public function test_reading_with_strange_values_never_crashes_for_a_visitor(): void
    {
        $crashes = [];
        foreach ($this->routesFor('GET') as $uri) {
            foreach (self::STRANGE_QUERIES as $query) {
                $status = $this->getJson($this->concreteUri($uri) . '?' . $query)->status();
                if ($status >= 500) {
                    $crashes[] = "GET {$uri}?{$query} -> {$status}";
                }
            }
        }

        $this->assertNoCrashes($crashes);
    }

    /** A person with this role, as anyone could become one by signing up, or (admin) as a stolen account would be. */
    private function actingAs_(string $role): void
    {
        $user = match ($role) {
            'seller' => $this->seller('Fuzz Shop ' . uniqid(), $this->qc),
            default  => $this->user($role),
        };
        if ($role === 'admin') {
            $user->forceFill(['role' => 'admin'])->save();
        }
        Sanctum::actingAs($user);
    }

    public static function roles(): array
    {
        return ['buyer' => ['buyer'], 'seller' => ['seller'], 'admin' => ['admin']];
    }

    public static function rolesAndMethods(): array
    {
        $all = [];
        foreach (['buyer', 'seller', 'admin'] as $role) {
            foreach (['POST', 'PATCH', 'PUT', 'DELETE'] as $method) {
                $all["{$role} {$method}"] = [$role, $method];
            }
        }

        return $all;
    }

    #[DataProvider('roles')]
    public function test_reading_with_strange_values_never_crashes_when_signed_in(string $role): void
    {
        $this->actingAs_($role);
        $crashes = [];
        foreach ($this->routesFor('GET') as $uri) {
            foreach (self::STRANGE_QUERIES as $query) {
                $status = $this->getJson($this->concreteUri($uri) . '?' . $query)->status();
                if ($status >= 500) {
                    $crashes[] = "GET {$uri}?{$query} -> {$status}";
                }
            }
        }

        $this->assertNoCrashes($crashes);
    }

    #[DataProvider('writeMethods')]
    public function test_sending_strange_bodies_never_crashes_for_a_visitor(string $method): void
    {
        $this->sendStrangeBodies($method);
    }

    #[DataProvider('rolesAndMethods')]
    public function test_sending_strange_bodies_never_crashes_when_signed_in(string $role, string $method): void
    {
        $this->actingAs_($role);
        $this->sendStrangeBodies($method);
    }

    public static function writeMethods(): array
    {
        return ['POST' => ['POST'], 'PATCH' => ['PATCH'], 'PUT' => ['PUT'], 'DELETE' => ['DELETE']];
    }

    private function sendStrangeBodies(string $method): void
    {
        $shapes = [
            'lists'   => fn () => ['a', 'b'],
            'objects' => fn () => ['x' => ['y' => 'z']],
            'huge'    => fn () => 999999999999999999,
            'long'    => fn () => str_repeat('a', 5000),
            'nulls'   => fn () => null,
        ];

        $crashes = [];
        foreach ($this->routesFor($method) as $uri) {
            foreach ($shapes as $shape => $make) {
                $body = [];
                foreach (self::FIELDS as $field) {
                    $body[$field] = $make();
                }
                $status = $this->json($method, $this->concreteUri($uri), $body)->status();
                if ($status >= 500) {
                    $crashes[] = "{$method} {$uri} with {$shape} -> {$status}";
                }
            }
        }

        $this->assertNoCrashes($crashes);
    }

    public function test_a_body_that_is_not_json_is_refused_cleanly(): void
    {
        $status = $this->call('POST', '/api/v1/auth/login', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], '{not json')->status();

        $this->assertLessThan(500, $status);
    }

}
