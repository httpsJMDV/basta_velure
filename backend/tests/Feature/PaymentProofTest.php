<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** GCash receipts are private: only a signed, expiring link (given to the buyer, the shop and admins) opens one. */
class PaymentProofTest extends TestCase
{
    use DatabaseTransactions;

    private function order(string $path): Order
    {
        $buyer = User::forceCreate([
            'first_name' => 'Pay', 'last_name' => 'Proof', 'email' => 'proof.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);

        return Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => 'PLACED', 'subtotal' => 100, 'shipping_fee' => 50,
            'total' => 150, 'payment_method' => 'gcash', 'payment_status' => 'pending_verification', 'payment_proof_path' => $path,
            'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St', 'shipping_province' => 'Laguna',
            'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
        ]);
    }

    public function test_only_the_signed_link_opens_the_receipt(): void
    {
        Storage::fake('ids');
        $path = UploadedFile::fake()->image('receipt.jpg')->store('orders/payment-proofs', 'ids');
        $order = $this->order($path);

        $url = $order->paymentProofUrl();
        $this->get($url)->assertOk();

        $this->get("/api/v1/orders/{$order->id}/payment-proof")->assertForbidden();
        $this->get(preg_replace('/signature=[^&]+/', 'signature=forged', $url))->assertForbidden();

        $this->travel(2)->hours();
        $this->get($url)->assertForbidden();
    }

    public function test_an_older_receipt_on_the_public_disk_still_opens(): void
    {
        Storage::fake('ids');
        Storage::fake('public');
        $path = UploadedFile::fake()->image('old.jpg')->store('orders/payment-proofs', 'public');

        $this->get($this->order($path)->paymentProofUrl())->assertOk();
    }
}
