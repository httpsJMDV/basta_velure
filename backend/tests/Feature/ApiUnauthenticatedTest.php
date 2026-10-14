<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every /api/* route must answer a guest with a JSON 401, even when the client sends no
 * "Accept: application/json" header (a browser opening a document URL, curl, a mobile client).
 * These tests deliberately use get()/post() and not getJson()/postJson(), which add that header.
 */
class ApiUnauthenticatedTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string}> */
    public static function protectedRoutes(): array
    {
        return [
            'admin stats'                 => ['GET', '/api/v1/admin/stats'],
            'admin document'              => ['GET', '/api/v1/admin/seller-applications/1/id-image'],
            'admin hub document'          => ['GET', '/api/v1/admin/sorting-center-applications/1/dti-permit'],
            'hub riders'                  => ['GET', '/api/v1/hub/riders'],
            'hub rider document'          => ['GET', '/api/v1/hub/riders/1/or-cr'],
            'rider profile'               => ['GET', '/api/v1/rider/me'],
            'rider deliveries'            => ['GET', '/api/v1/rider/deliveries'],
            'buyer orders'                => ['GET', '/api/v1/buyer/orders'],
            'buyer confirm receipt'       => ['POST', '/api/v1/buyer/orders/1/confirm-receipt'],
            'seller orders'               => ['GET', '/api/v1/seller/orders'],
            'conversations'               => ['GET', '/api/v1/conversations'],
            'delivery proof photo'        => ['GET', '/api/v1/parcels/LIT-000000-AAAAAA/delivery-proof'],
            'logout'                      => ['POST', '/api/v1/auth/logout'],
        ];
    }

    #[DataProvider('protectedRoutes')]
    public function test_guest_without_accept_header_gets_a_json_401(string $method, string $uri): void
    {
        $response = $this->call($method, $uri);

        $response->assertStatus(401);
        $response->assertJson(['message' => 'Unauthenticated.']);
        $this->assertStringContainsString('application/json', (string) $response->headers->get('Content-Type'));
    }

    public function test_guest_with_a_bad_bearer_token_and_no_accept_header_gets_a_json_401(): void
    {
        $response = $this->call('GET', '/api/v1/rider/me', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer not-a-real-token']);

        $response->assertStatus(401);
        $response->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_a_guest_with_the_json_accept_header_still_gets_the_same_401(): void
    {
        $this->getJson('/api/v1/hub/riders')->assertStatus(401)->assertJson(['message' => 'Unauthenticated.']);
    }
}
