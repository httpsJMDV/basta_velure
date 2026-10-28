<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\Commerce\BuyerOrderPresenter;
use App\Services\Commerce\CheckoutCalculator;
use App\Services\Commerce\OrderPlacer;
use App\Services\Commerce\SandboxGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Checkout (B8, B9): a quote the page shows while the buyer picks the address and vouchers, and Place Order.
 *
 * Items come from the selected cart lines, or from Buy Now (one item, the cart left as it is). The delivery address
 * is a saved address (address_id) or the address fields themselves.
 */
class CheckoutController extends Controller
{
    public function __construct(
        private readonly CheckoutCalculator $calculator,
        private readonly OrderPlacer $placer,
    ) {}

    /** POST /checkout/quote */
    public function quote(Request $request): JsonResponse
    {
        $request->validate($this->commonRules());
        [$items] = $this->items($request);
        [$destination] = $this->destination($request, quoteOnly: true);

        $quote = $this->calculator->quote($request->user(), $items, $destination, $this->codes($request));

        return response()->json(['data' => CheckoutCalculator::present($quote)]);
    }

    /** POST /checkout/place-order */
    public function place(Request $request): JsonResponse
    {
        $user = $request->user();
        // A buyer orders only once their government ID is approved (they can browse and fill a cart before).
        if ($blocked = $user->orderBlockedByIdCheck()) {
            return response()->json($blocked, 403);
        }
        $request->validate($this->commonRules() + [
            'payment_method' => ['required', 'in:cod,gcash,e_wallet,card'],
            'notes'          => ['nullable'],
            'expected_total' => ['nullable', 'numeric', 'min:0'],
            'idempotency_key' => ['nullable', 'string', 'max:80'],
        ], [
            'payment_method.required' => 'Choose how you will pay.',
            'payment_method.in'       => 'Choose cash on delivery, GCash, e-wallet or card.',
        ]);
        $notes = $this->notes($request);
        [$items, $source] = $this->items($request);
        [$destination, $snapshot] = $this->destination($request);

        $method = $request->input('payment_method');
        $gcash = $method === 'gcash' ? $this->gcashPayments($request, $items) : [];
        $key = trim((string) ($request->header('Idempotency-Key') ?? $request->input('idempotency_key', '')));

        try {
            $result = $this->placer->place($user, [
                'items' => $items, 'destination' => $destination, 'snapshot' => $snapshot, 'codes' => $this->codes($request),
                'payment_method' => $method, 'notes' => $notes, 'source' => $source,
                'expected_total' => $request->filled('expected_total') ? (float) $request->input('expected_total') : null,
            ], $key !== '' ? $key : null, $gcash);
        } catch (\Throwable $e) {
            if ($gcash) {
                Storage::disk('public')->delete(array_column($gcash, 'proof_path'));
            }
            throw $e;
        }
        if ($result['repeated'] && $gcash) {
            Storage::disk('public')->delete(array_column($gcash, 'proof_path'));
        }

        $orders = $result['orders']->map(fn ($o) => BuyerOrderPresenter::present($o->fresh(['items.seller.sellerProfile', 'payment', 'statusHistories', 'parcel'])))->values();
        $session = $result['session'];

        return response()->json([
            'message'           => $result['repeated']
                ? 'This order was already placed.'
                : ($orders->count() > 1 ? 'Orders placed successfully!' : 'Order placed successfully!'),
            'repeated'          => $result['repeated'],
            'data'              => $orders->first(),
            'orders'            => $orders,
            'checkout_group_id' => $result['checkout_group_id'],
            'payment'           => $session && $session->status === 'pending' ? SandboxGateway::present($session) : null,
        ], $result['repeated'] ? 200 : 201);
    }

    private function commonRules(): array
    {
        return [
            'source'               => ['nullable', 'in:cart,buy_now'],
            'items'                => ['nullable', 'array', 'min:1', 'max:' . CartItem::MAX_LINES],
            'items.*.variant_id'   => ['nullable', 'integer'],
            'items.*.product_id'   => ['nullable', 'integer'],
            'items.*.quantity'     => ['required_with:items', 'integer', 'min:1', 'max:99999'],
            'address_id'           => ['nullable', 'integer'],
            'vouchers'             => ['nullable', 'array'],
            'vouchers.store'       => ['nullable', 'array'],
            'vouchers.platform'    => ['nullable', 'string', 'max:20'],
            'vouchers.shipping'    => ['nullable', 'string', 'max:20'],
        ];
    }

    /** @return array{0: array<int, array{variant_id: int, quantity: int}>, 1: string} */
    private function items(Request $request): array
    {
        $raw = $request->input('items');
        if (is_array($raw) && $raw !== []) {
            $items = [];
            foreach ($raw as $i => $row) {
                $vid = (int) ($row['variant_id'] ?? 0);
                if ($vid < 1 && ! empty($row['product_id'])) {
                    // An older client sends the product only: its first variant.
                    $vid = (int) ProductVariant::where('product_id', (int) $row['product_id'])->orderBy('id')->value('id');
                    if (! $vid && ! Product::whereKey((int) $row['product_id'])->exists()) {
                        throw ValidationException::withMessages(["items.{$i}.product_id" => 'This product no longer exists.']);
                    }
                }
                $items[] = ['variant_id' => $vid, 'quantity' => $row['quantity'] ?? 1];
            }

            return [$items, $request->input('source', 'buy_now') === 'cart' ? 'cart' : 'buy_now'];
        }

        $items = CartItem::where('user_id', $request->user()->id)->where('selected', true)->orderBy('id')->get()
            ->map(fn ($c) => ['variant_id' => $c->product_variant_id, 'quantity' => $c->quantity])->all();

        return [$items, 'cart'];
    }

    /**
     * @return array{0: ?array{region: ?string, province: ?string, city: ?string, barangay: ?string}, 1: array<string, mixed>}
     */
    private function destination(Request $request, bool $quoteOnly = false): array
    {
        if ($request->filled('address_id')) {
            $address = Address::where('user_id', $request->user()->id)->find((int) $request->input('address_id'));
            if (! $address) {
                throw ValidationException::withMessages(['address_id' => 'Choose one of your saved addresses.']);
            }
            if (! $address->barangay_code) {
                throw ValidationException::withMessages(['address_id' => 'This address needs updating: edit it and choose the province, city and barangay again.']);
            }

            return [[
                'region' => $address->region_code, 'province' => $address->province_code, 'city' => $address->city_code, 'barangay' => $address->barangay_code,
            ], [
                'shipping_name' => $address->full_name, 'shipping_phone' => $address->phone,
                'shipping_address' => trim(implode(', ', array_filter([$address->floor_unit, $address->address]))),
                'shipping_province' => $address->province, 'shipping_city' => $address->district, 'shipping_barangay' => $address->ward,
                'shipping_province_code' => $address->province_code, 'shipping_city_code' => $address->city_code, 'shipping_barangay_code' => $address->barangay_code,
            ]];
        }

        if ($quoteOnly && ! $request->filled('shipping_barangay_code')) {
            return [null, []];
        }

        $data = $request->validate([
            'shipping_name'          => ['required', 'string', 'max:150'],
            'shipping_phone'         => ['required', 'string', 'max:30'],
            'shipping_address'       => ['required', 'string', 'max:255'],
            'shipping_province'      => ['nullable', 'string', 'max:100'],
            'shipping_city'          => ['nullable', 'string', 'max:100'],
            'shipping_barangay'      => ['nullable', 'string', 'max:100'],
            'shipping_region_code'   => ['nullable', 'string', 'regex:/^\d{9,10}$/'],
            'shipping_province_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'shipping_city_code'     => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'shipping_barangay_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
        ], [
            'shipping_barangay_code.required' => 'Selected delivery address is missing a barangay PSGC code. Please re-select or update your delivery address to proceed with checkout.',
            'shipping_city_code.required'     => 'Selected delivery address is missing a city/municipality PSGC code. Please re-select or update your delivery address to proceed with checkout.',
            'shipping_province_code.required' => 'Selected delivery address is missing a province PSGC code. Please re-select or update your delivery address to proceed with checkout.',
        ]);

        return [[
            'region' => $data['shipping_region_code'] ?? null, 'province' => $data['shipping_province_code'],
            'city' => $data['shipping_city_code'], 'barangay' => $data['shipping_barangay_code'],
        ], [
            'shipping_name' => $data['shipping_name'], 'shipping_phone' => $data['shipping_phone'], 'shipping_address' => $data['shipping_address'],
            'shipping_province' => $data['shipping_province'] ?? null, 'shipping_city' => $data['shipping_city'] ?? null, 'shipping_barangay' => $data['shipping_barangay'] ?? null,
            'shipping_province_code' => $data['shipping_province_code'], 'shipping_city_code' => $data['shipping_city_code'], 'shipping_barangay_code' => $data['shipping_barangay_code'],
        ]];
    }

    /** @return array{store: array<int|string, ?string>, platform: ?string, shipping: ?string} */
    private function codes(Request $request): array
    {
        $v = (array) $request->input('vouchers', []);

        return [
            'store'    => array_filter((array) ($v['store'] ?? []), fn ($c) => is_string($c) && trim($c) !== ''),
            'platform' => isset($v['platform']) && is_string($v['platform']) ? $v['platform'] : null,
            'shipping' => isset($v['shipping']) && is_string($v['shipping']) ? $v['shipping'] : null,
        ];
    }

    /** A note to each seller, up to 200 characters (A25); an older client sends one note for every shop. */
    private function notes(Request $request): array|string|null
    {
        $notes = $request->input('notes');
        $max = CheckoutCalculator::NOTE_MAX;
        $check = function (?string $note, string $field) use ($max) {
            if ($note !== null && mb_strlen(trim($note)) > $max) {
                throw ValidationException::withMessages([$field => "A note to the seller can be at most {$max} characters."]);
            }
        };
        if (is_array($notes)) {
            foreach ($notes as $sellerId => $note) {
                $check(is_string($note) ? $note : null, "notes.{$sellerId}");
            }

            return $notes;
        }
        $check(is_string($notes) ? $notes : null, 'notes');

        return is_string($notes) ? $notes : null;
    }

    /**
     * GCash goes straight to each shop's own GCash: one 13-digit reference and one receipt per shop, sent as
     * gcash[SELLER_ID][reference] and gcash_proof[SELLER_ID]; a one-shop checkout may send payment_reference and
     * payment_proof. Every shop must have set up its GCash. The receipts are stored once everything checks out.
     *
     * @param  array<int, array{variant_id: int}>  $items
     * @return array<int, array{reference: string, proof_path: string}>
     */
    private function gcashPayments(Request $request, array $items): array
    {
        $sellerIds = Product::withTrashed()
            ->whereIn('id', ProductVariant::withTrashed()->whereIn('id', array_column($items, 'variant_id'))->pluck('product_id'))
            ->distinct()->pluck('seller_id')->map(fn ($id) => (int) $id)->all();
        $profiles = \App\Models\SellerProfile::whereIn('user_id', $sellerIds)->get(['id', 'user_id', 'shop_name', 'gcash_number'])->keyBy('user_id');
        $single = count($sellerIds) === 1;
        $errors = [];
        $found = [];

        foreach ($sellerIds as $sellerId) {
            $profile = $profiles[$sellerId] ?? null;
            if (! $profile || ! $profile->gcash_number) {
                $errors['gcash'][] = ($profile->shop_name ?? 'A shop in your cart') . ' does not take GCash yet. Pay by cash on delivery, or check out its items separately.';
                continue;
            }
            $refKey = $single && ! $request->has("gcash.{$sellerId}.reference") ? 'payment_reference' : "gcash.{$sellerId}.reference";
            $proofKey = $single && ! $request->hasFile("gcash_proof.{$sellerId}") ? 'payment_proof' : "gcash_proof.{$sellerId}";
            $reference = \App\Support\Gcash::reference($request->input($refKey));
            $proof = $request->file($proofKey);
            if ($reference === '') {
                $errors[$refKey][] = "Enter the 13-digit reference number from your GCash receipt for {$profile->shop_name}.";
            } elseif (strlen($reference) !== 13) {
                $errors[$refKey][] = 'A GCash reference number has exactly 13 digits.';
            }
            if (! $proof) {
                $errors[$proofKey][] = "Upload a screenshot of your GCash receipt for {$profile->shop_name}.";
            } elseif (! in_array((string) $proof->getMimeType(), ['image/jpeg', 'image/png'], true) || $proof->getSize() > 5 * 1024 * 1024) {
                $errors[$proofKey][] = 'The receipt must be a JPG or PNG image up to 5 MB.';
            }
            $found[$sellerId] = ['reference' => $reference, 'proof' => $proof];
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return array_map(fn ($p) => ['reference' => $p['reference'], 'proof_path' => $p['proof']->store('orders/payment-proofs', 'public')], $found);
    }
}
