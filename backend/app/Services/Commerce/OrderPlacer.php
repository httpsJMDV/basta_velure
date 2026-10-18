<?php

namespace App\Services\Commerce;

use App\Enums\OrderStatus;
use App\Models\CartItem;
use App\Models\FlashSale;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\PaymentSession;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\Voucher;
use App\Models\VoucherClaim;
use App\Models\VoucherUsage;
use App\Services\MailNotifier;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Places the orders of a checkout, one per store (B8, B9).
 *
 * - Idempotent (A37): a repeated Place Order with the same key returns the orders the first one created.
 * - Priced again under row locks; if the total differs from the one the buyer confirmed, or a chosen voucher no
 *   longer applies, nothing is placed and the new quote comes back for the buyer to confirm (409).
 * - Stock is deducted at placement for every payment method (A3); flash units are counted against the flash sale.
 * - Money (A8, A9): store vouchers and promotions are the shop's, platform and shipping vouchers are Loved-IT's.
 *   Commission is 5% of each line after the shop's own discounts, rounded per order.
 * - COD and GCash orders go to the shop directly; e-wallet and card orders are paid through the sandbox gateway
 *   within an hour (A6) and settled by Loved-IT, which pays the shop out once the order is completed (A15).
 */
class OrderPlacer
{
    public function __construct(private readonly CheckoutCalculator $calculator) {}

    /**
     * @param  array{items: array, destination: array, snapshot: array, codes: array, payment_method: string, notes: array<int|string, ?string>|string|null, source: string, expected_total: ?float}  $input
     * @param  array<int, array{reference: string, proof_path: string}>  $gcash  per seller id
     * @return array{repeated: bool, orders: Collection<int, Order>, checkout_group_id: string, session: ?PaymentSession}
     */
    public function place(User $buyer, array $input, ?string $key, array $gcash = []): array
    {
        return DB::transaction(function () use ($buyer, $input, $key, $gcash) {
            if ($key !== null && $key !== '') {
                try {
                    DB::table('checkout_requests')->insert(['buyer_id' => $buyer->id, 'idempotency_key' => $key, 'created_at' => now()]);
                } catch (UniqueConstraintViolationException) {
                    $group = DB::table('checkout_requests')->where('buyer_id', $buyer->id)->where('idempotency_key', $key)->value('checkout_group_id');
                    $orders = $group ? Order::where('checkout_group_id', $group)->orderBy('id')->get() : collect();
                    if ($orders->isEmpty()) {
                        throw new HttpResponseException(response()->json(['message' => 'This order is already being placed. Check My Orders in a moment.'], 409));
                    }

                    return ['repeated' => true, 'orders' => $orders, 'checkout_group_id' => $group, 'session' => PaymentSession::where('checkout_group_id', $group)->latest('id')->first()];
                }
            }

            $quote = $this->calculator->quote($buyer, $input['items'], $input['destination'], $input['codes'], lock: true);
            if (! $quote['can_place']) {
                throw ValidationException::withMessages(['items' => array_column($quote['problems'], 'message')]);
            }
            $this->refuseChangedVouchers($quote, $input['codes']);
            if ($input['expected_total'] !== null && abs($quote['totals']['total'] - (float) $input['expected_total']) > 0.004) {
                $this->conflict('price_changed', 'Prices changed since you opened checkout. The total is now ₱' . number_format($quote['totals']['total'], 2) . '. Check the new total and place the order again.', $quote);
            }

            $method = $input['payment_method'];
            $gateway = in_array($method, Order::GATEWAY_METHODS, true);
            $groupId = (string) Str::uuid();
            $stamp = date('ymdHis');
            $random = strtoupper(Str::random(4));
            $storeCount = count($quote['stores']);
            $dueAt = $gateway ? now()->addMinutes(PaymentSession::PAY_WITHIN_MINUTES) : null;
            $orders = collect();
            $stock = [];
            $flash = [];
            $usages = [];

            foreach ($quote['stores'] as $n => $store) {
                $sellerId = $store['seller']['id'];
                $pay = $gcash[$sellerId] ?? null;
                $note = is_array($input['notes']) ? ($input['notes'][$sellerId] ?? $input['notes'][(string) $sellerId] ?? null) : $input['notes'];
                $order = Order::create([
                    'logistics_company_id'      => $store['shipping']['company_id'],
                    'buyer_id'                  => $buyer->id,
                    'checkout_group_id'         => $groupId,
                    'order_number'              => $storeCount > 1 ? "VEL-{$random}-{$stamp}-" . ($n + 1) : "VEL-{$random}-{$stamp}",
                    'subtotal'                  => $store['merchandise'],
                    'promo_discount'            => $store['promo_discount'],
                    'store_voucher_id'          => ($store['store_voucher']['applied'] ?? false) ? $store['store_voucher']['id'] : null,
                    'store_voucher_discount'    => $store['store_discount'],
                    'platform_voucher_id'       => $store['platform_discount'] > 0 ? $quote['platform_voucher']['id'] : null,
                    'platform_voucher_discount' => $store['platform_discount'],
                    'shipping_voucher_id'       => $store['shipping_discount'] > 0 ? $quote['shipping_voucher']['id'] : null,
                    'shipping_voucher_discount' => $store['shipping_discount'],
                    'shipping_fee'              => $store['shipping']['fee'],
                    'courier_fee'               => $store['shipping']['courier_fee'],
                    'free_delivery'             => $store['shipping']['free_delivery'],
                    'total_weight_grams'        => $store['shipping']['weight_grams'],
                    'chargeable_weight_kg'      => $store['shipping']['chargeable_kg'],
                    'shipping_route'            => $store['shipping']['route'],
                    'total'                     => $store['total'],
                    'payment_method'            => $method,
                    'payment_status'            => $method === 'gcash' ? 'pending_verification' : 'pending',
                    'payment_due_at'            => $dueAt,
                    'settlement'                => $gateway ? Order::SETTLEMENT_PLATFORM : Order::SETTLEMENT_DIRECT,
                    'status'                    => OrderStatus::PLACED->value,
                    'payment_reference'         => $pay['reference'] ?? null,
                    'payment_proof_path'        => $pay['proof_path'] ?? null,
                    'notes'                     => $note !== null && trim((string) $note) !== '' ? trim(strip_tags((string) $note)) : null,
                    ...$input['snapshot'],
                ]);

                OrderStatusHistory::create([
                    'order_id' => $order->id, 'from_status' => null, 'to_status' => OrderStatus::PLACED->value,
                    'actor_type' => 'buyer', 'actor_id' => $buyer->id, 'note' => 'Order placed by customer', 'created_at' => now(),
                ]);

                foreach ($this->itemRows($store, $gateway) as $row) {
                    $order->items()->create($row);
                }
                foreach ($store['lines'] as $line) {
                    $stock[$line['variant_id']] = ($stock[$line['variant_id']] ?? 0) + $line['quantity'];
                    if ($line['flash_sale_id']) {
                        $flash[$line['flash_sale_id']] = ($flash[$line['flash_sale_id']] ?? 0) + $line['quantity'];
                    }
                }

                Payment::create([
                    'order_id' => $order->id, 'method' => $method, 'reference_number' => $pay['reference'] ?? null,
                    'amount' => $store['total'], 'status' => 'pending',
                ]);

                if ($order->store_voucher_id) {
                    $usages[] = ['voucher_id' => $order->store_voucher_id, 'order_id' => $order->id, 'amount' => $store['store_discount']];
                }
                if ($order->platform_voucher_id) {
                    $usages[] = ['voucher_id' => $order->platform_voucher_id, 'order_id' => $order->id, 'amount' => $store['platform_discount']];
                }
                if ($order->shipping_voucher_id) {
                    $usages[] = ['voucher_id' => $order->shipping_voucher_id, 'order_id' => $order->id, 'amount' => $store['shipping_discount']];
                }
                $orders->push($order);
            }

            $this->takeStock($stock, $quote);
            $this->countFlash($flash, $quote);
            $this->recordVouchers($buyer, $groupId, $usages);

            $session = null;
            if ($gateway) {
                $session = PaymentSession::create([
                    'buyer_id' => $buyer->id, 'checkout_group_id' => $groupId, 'token' => Str::random(48), 'method' => $method,
                    'amount' => round($orders->sum(fn ($o) => (float) $o->total), 2), 'status' => 'pending', 'expires_at' => $dueAt,
                ]);
                Payment::whereIn('order_id', $orders->pluck('id'))->update(['payment_session_id' => $session->id]);
            }

            if ($key !== null && $key !== '') {
                DB::table('checkout_requests')->where('buyer_id', $buyer->id)->where('idempotency_key', $key)->update(['checkout_group_id' => $groupId]);
            }
            if (($input['source'] ?? 'cart') === 'cart') {
                CartItem::where('user_id', $buyer->id)->whereIn('product_variant_id', array_keys($stock))->delete();
            }

            app(MailNotifier::class)->ordersPlaced($orders->all());

            return ['repeated' => false, 'orders' => $orders, 'checkout_group_id' => $groupId, 'session' => $session];
        });
    }

    /** The order items of one store, with commission (A9) worked out per order and rounded once. */
    private function itemRows(array $store, bool $gateway): array
    {
        $rows = [];
        $grossTotal = 0.0;
        $exactCommission = 0.0;
        foreach ($store['lines'] as $line) {
            $rate = PlatformSetting::getCommissionRateForCategory($line['category_slug']);
            $gross = max(0, round($line['subtotal'] - $line['store_voucher_share'] - $line['promo_share'], 2));
            $grossTotal += $gross;
            $exactCommission += $gross * $rate;
            $rows[] = [
                'seller_id'           => $store['seller']['id'],
                'product_id'          => $line['product_id'],
                'product_variant_id'  => $line['variant_id'],
                'category_id'         => Product::withTrashed()->whereKey($line['product_id'])->value('category_id'),
                'product_name'        => $line['name'],
                'variant_label'       => $line['variant_label'],
                'unit_price'          => $line['unit_price'],
                'regular_unit_price'  => $line['regular_price'],
                'price_source'        => $line['price_source'],
                'flash_sale_id'       => $line['flash_sale_id'],
                'store_sale_id'       => $line['sale_id'],
                'is_gift'             => $line['free_quantity'] > 0 && $line['free_quantity'] >= $line['quantity'],
                'quantity'            => $line['quantity'],
                'subtotal'            => $line['subtotal'],
                'store_voucher_share' => $line['store_voucher_share'],
                'promo_share'         => $line['promo_share'],
                'weight_grams'        => $line['unit_grams'] * $line['quantity'],
                'image_url'           => $line['image_url'],
                'commission_rate'     => $rate,
                'commission_amount'   => round($gross * $rate, 2, PHP_ROUND_HALF_UP),
                'seller_earnings'     => 0,
                'payout_status'       => $gateway ? 'pending_release' : 'direct',
                '_gross'              => $gross,
            ];
        }
        // Commission is rounded once per order; the centavo difference goes to the largest line.
        $target = round($exactCommission, 2, PHP_ROUND_HALF_UP);
        $diff = round($target - array_sum(array_column($rows, 'commission_amount')), 2);
        if ($rows && abs($diff) >= 0.01) {
            $largest = array_keys(array_column($rows, '_gross'), max(array_column($rows, '_gross')))[0];
            $rows[$largest]['commission_amount'] = round($rows[$largest]['commission_amount'] + $diff, 2);
        }
        foreach ($rows as &$r) {
            $r['seller_earnings'] = round($r['_gross'] - $r['commission_amount'], 2);
            unset($r['_gross']);
        }

        return $rows;
    }

    /** @param  array<int, int>  $stock  variant id => units */
    private function takeStock(array $stock, array $quote): void
    {
        foreach ($stock as $variantId => $qty) {
            $updated = ProductVariant::whereKey($variantId)->where('stock_quantity', '>=', $qty)->decrement('stock_quantity', $qty);
            if (! $updated) {
                $this->conflict('stock_changed', 'An item sold out while you were checking out. Review your order and try again.', $quote);
            }
        }
        foreach (collect($quote['stores'])->flatMap(fn ($s) => $s['lines'])->groupBy('product_id') as $productId => $lines) {
            Product::withTrashed()->whereKey($productId)->increment('units_sold', (int) $lines->sum('quantity'));
        }
    }

    /** @param  array<int, int>  $flash  flash sale id => units */
    private function countFlash(array $flash, array $quote): void
    {
        foreach ($flash as $id => $qty) {
            $sale = FlashSale::lockForUpdate()->find($id);
            if (! $sale || $sale->remaining() < $qty) {
                $this->conflict('price_changed', 'The flash sale ran out while you were checking out. Check the new total and place the order again.', $quote);
            }
            $sale->increment('sold', $qty);
        }
    }

    /** One usage per order (a platform voucher on several store orders is one use of it, A8). */
    private function recordVouchers(User $buyer, string $groupId, array $usages): void
    {
        foreach (collect($usages)->groupBy('voucher_id') as $voucherId => $rows) {
            $voucher = Voucher::lockForUpdate()->find($voucherId);
            if (! $voucher || $voucher->limitReached()) {
                throw new HttpResponseException(response()->json(['message' => 'A voucher you chose was fully used a moment ago. Remove it and place the order again.', 'code' => 'voucher_invalid'], 409));
            }
            foreach ($rows as $row) {
                VoucherUsage::create($row + ['user_id' => $buyer->id, 'checkout_group_id' => $groupId]);
            }
            $voucher->increment('used_count');
            VoucherClaim::firstOrCreate(['voucher_id' => $voucher->id, 'user_id' => $buyer->id], ['claimed_at' => now()]);
        }
    }

    /** A chosen voucher that no longer applies (ended, expired, under the minimum spend) stops the order (B8). */
    private function refuseChangedVouchers(array $quote, array $codes): void
    {
        $failed = [];
        foreach ($quote['stores'] as $s) {
            if ($s['store_voucher'] && ! $s['store_voucher']['applied']) {
                $failed[] = "{$s['store_voucher']['code']}: {$s['store_voucher']['message']}";
            }
        }
        foreach (['platform_voucher', 'shipping_voucher'] as $k) {
            if ($quote[$k] && ! $quote[$k]['applied']) {
                $failed[] = "{$quote[$k]['code']}: {$quote[$k]['message']}";
            }
        }
        if ($failed) {
            $this->conflict('voucher_invalid', 'A voucher can no longer be used, so the order was not placed. ' . implode(' ', $failed), $quote);
        }
    }

    private function conflict(string $code, string $message, array $quote): never
    {
        throw new HttpResponseException(response()->json([
            'code' => $code, 'message' => $message, 'quote' => CheckoutCalculator::present($quote),
        ], 409));
    }
}
