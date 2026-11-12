<?php

namespace App\Services\Showcase;

use App\Enums\OrderStatus;
use App\Models\Address;
use App\Models\CodRemittance;
use App\Models\DeliveryLog;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Review;
use App\Models\Rider;
use App\Models\ShopReview;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Commerce\OrderPlacer;
use App\Services\Courier\HubRouter;
use App\Services\Demo\PlaceholderImage;
use App\Services\MailNotifier;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use App\Support\ProductRatings;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Gives every showcase buyer (buyer1, buyer2, ...) a real order history (php artisan showcase:orders), so the site
 * looks lived in: product pages have sales and reviews, shops have comments, and the hub, rider and courier reports
 * have deliveries in them.
 *
 * Each buyer places one to three orders through the real checkout (OrderPlacer: the courier's route-and-weight
 * delivery fee, commission, stock), spread over the last three months. Every order then goes through the real
 * order state machine the way the endpoints move it: the shop confirms and packs it, a rider of the courier's hub
 * near the shop picks it up, the hub near the buyer sorts it and gives it to one of its riders, who delivers it, and
 * the buyer confirms receipt. Most delivered items get a product review (mostly 4 and 5 stars, some lower, some with
 * the shop's reply), some buyers leave a comment on the shop, and the cash on delivery the riders collected is
 * remitted to their courier and confirmed.
 *
 * Only showcase buyers with no order yet are used, so a second run continues where the first stopped and never adds
 * a second history to anyone. Emails and in-app notices are switched off while it runs. Real accounts are never
 * touched.
 */
class ShowcaseOrders
{
    /** Minutes between the steps of an order: [min, max]. */
    private const GAPS = [
        'confirm' => [40, 240], 'prepare' => [30, 300], 'ready' => [60, 600], 'pickup' => [40, 180], 'intake' => [60, 300],
        'sort' => [120, 720], 'assign' => [60, 600], 'start' => [15, 60], 'deliver' => [30, 240], 'complete' => [180, 2880],
    ];

    /** Above this price a product is a luxury (a ₱500,000 watch): bought now and then, not by everyone. */
    private const EVERYDAY_MAX = 60000;

    private ?\Closure $progress = null;

    private Carbon $now;

    /** @var array<int, int> product ids, shuffled, taken in turn so every product sells */
    private array $queue = [];

    private Collection $products;

    /** @var array<int, array<int, Rider>> hub id => riders who deliver */
    private array $riders = [];

    /** @var array<int, int> rider id => cash on delivery collected in centavos */
    private array $cod = [];

    private string $proofPath;

    private string $receiptPath;

    public function __construct(
        private readonly OrderPlacer $placer,
        private readonly OrderStateMachine $machine,
        private readonly HubRouter $router,
    ) {}

    /**
     * @return array{buyers: int, orders: int, reviews: int, shop_comments: int, skipped: int}
     */
    public function run(?callable $progress = null, int $limit = 0): array
    {
        $this->progress = $progress ? \Closure::fromCallable($progress) : null;
        $this->now = Carbon::now();

        $buyers = $this->buyers();
        if ($limit > 0) {
            $buyers = $buyers->take($limit);
        }
        $this->products = $this->products();
        if ($this->products->isEmpty()) {
            throw new RuntimeException('No showcase products to buy. Run php artisan showcase:seed (and showcase:fill-catalog) first.');
        }
        $this->proofPath = $this->file('ids', 'delivery-proof', [70, 150, 90]);
        $this->receiptPath = $this->file('ids', 'gcash-receipt', [30, 110, 200]);

        $counts = ['buyers' => 0, 'orders' => 0, 'reviews' => 0, 'shop_comments' => 0, 'skipped' => 0];
        $touched = [];

        try {
            Notifier::muted(function () use ($buyers, &$counts, &$touched) {
                MailNotifier::muted(function () use ($buyers, &$counts, &$touched) {
                foreach ($buyers as $n => $buyer) {
                    try {
                        $made = DB::transaction(function () use ($buyer, &$counts, &$touched) {
                            return $this->buyerHistory($buyer, $counts, $touched);
                        });
                    } catch (Throwable $e) {
                        // One buyer's history is all or nothing; the run goes on with the next buyer.
                        $counts['skipped']++;
                        $this->say("  {$buyer->username} skipped: {$e->getMessage()}");
                        $made = 0;
                    }
                    $counts['buyers'] += $made > 0 ? 1 : 0;
                    if (($n + 1) % 20 === 0) {
                        $this->say('  ' . ($n + 1) . ' buyers, ' . $counts['orders'] . ' orders');
                    }
                }
                $this->remitCod();
                });
            });
        } finally {
            Carbon::setTestNow();
        }

        foreach (array_keys($touched) as $productId) {
            ProductRatings::refresh($productId);
        }

        return $counts;
    }

    /** Showcase buyers (buyer1, buyer2, ...) with a usable address and no order yet. */
    private function buyers(): Collection
    {
        return User::where('username', 'like', 'buyer%')
            ->where('email', 'like', '%@' . config('showcase.email_domain'))
            ->where('role', 'buyer')->where('status', 'active')
            ->whereNotIn('id', Order::select('buyer_id'))
            ->with(['addresses', 'sellerProfile', 'sortingCenter', 'rider', 'logisticsMembership.company'])
            ->get()
            ->filter(fn (User $u) => preg_match('/^buyer\d+$/', (string) $u->username) && ! $u->isWorkAccount() && ! $u->isSellerAccount())
            ->sortBy(fn (User $u) => (int) substr($u->username, 5))
            ->values();
    }

    /** Products of showcase shops that can be bought, with their category's main category. */
    private function products(): Collection
    {
        return Product::with(['variants', 'category.parent'])
            ->where('status', 'active')
            ->whereHas('seller', fn ($q) => $q->where('status', 'active')->where('username', 'like', 'seller%')
                ->where('email', 'like', '%@' . config('showcase.email_domain')))
            ->whereHas('seller.sellerProfile', fn ($q) => $q->where('application_status', 'approved')->where(fn ($w) => $w->whereNull('on_vacation')->orWhere('on_vacation', false)))
            ->get()
            ->filter(fn (Product $p) => $p->variants->contains(fn ($v) => $v->stock_quantity >= 3))
            ->keyBy('id');
    }

    private function nextProduct(?int $sellerId = null, array $except = []): ?Product
    {
        if ($sellerId !== null) {
            // A second item from the same shop is an add-on, not a second big-ticket item.
            $same = $this->products->filter(fn (Product $p) => $p->seller_id === $sellerId && ! in_array($p->id, $except, true) && (float) $p->base_price <= 5000);

            return $same->isEmpty() ? null : $same->random();
        }
        if ($this->queue === []) {
            // Every everyday product sells in each round; a luxury one only in about one round out of seven.
            $this->queue = $this->products
                ->filter(fn (Product $p) => (float) $p->base_price <= self::EVERYDAY_MAX || mt_rand(1, 100) <= 15)
                ->keys()->shuffle()->all();
        }

        return $this->products->get(array_shift($this->queue));
    }

    /** One buyer's orders, from about three months ago to last week. Returns how many were placed. */
    private function buyerHistory(User $buyer, array &$counts, array &$touched): int
    {
        $address = $buyer->addresses->firstWhere('is_default', true) ?? $buyer->addresses->first();
        if (! $address || ! $address->barangay_code) {
            $counts['skipped']++;

            return 0;
        }
        $howMany = [1, 1, 2, 2, 2, 3][mt_rand(0, 5)];
        $days = collect(range(1, $howMany))->map(fn () => mt_rand(8, 95))->sortDesc()->values();
        $made = 0;
        $shops = [];

        foreach ($days as $daysAgo) {
            $first = $this->nextProduct();
            if (! $first) {
                break;
            }
            $lines = [$first];
            if (mt_rand(1, 10) <= 3 && ($second = $this->nextProduct($first->seller_id, [$first->id]))) {
                $lines[] = $second;
            }

            $placedAt = $this->now->copy()->subDays($daysAgo)->setTime(mt_rand(7, 21), mt_rand(0, 59));
            $order = $this->place($buyer, $address, $lines, $placedAt, $made);
            if (! $order) {
                $counts['skipped']++;
                continue;
            }
            $this->deliver($order, $placedAt);
            $made++;
            $counts['orders']++;
            $shops[$order->items->first()->seller_id] = true;

            $counts['reviews'] += $this->review($order, $touched);
        }

        if ($shops && mt_rand(1, 100) <= 35) {
            $counts['shop_comments'] += $this->shopComment($buyer, (int) array_key_first($shops));
        }

        return $made;
    }

    /** Places the order through the real checkout. Null when the checkout refuses it (stock, limits). */
    private function place(User $buyer, Address $address, array $lines, Carbon $at, int $n): ?Order
    {
        Carbon::setTestNow($at);
        $items = array_map(fn (Product $p) => [
            'variant_id' => $p->variants->where('stock_quantity', '>=', 3)->random()->id,
            'quantity'   => (float) $p->base_price < 400 && mt_rand(1, 3) === 1 ? 2 : 1,
        ], $lines);
        $destination = ['region' => $address->region_code, 'province' => $address->province_code, 'city' => $address->city_code, 'barangay' => $address->barangay_code];
        $snapshot = [
            'shipping_name' => $address->full_name, 'shipping_phone' => $address->phone,
            'shipping_address' => trim(implode(', ', array_filter([$address->floor_unit, $address->address]))),
            'shipping_province' => $address->province, 'shipping_city' => $address->district, 'shipping_barangay' => $address->ward,
            'shipping_province_code' => $address->province_code, 'shipping_city_code' => $address->city_code, 'shipping_barangay_code' => $address->barangay_code,
        ];
        $notes = [null, null, null, 'Please call when you are near.', 'Pakiwan po sa guard kung wala ako.', 'Fragile, please handle with care.'];

        foreach (mt_rand(1, 4) === 1 ? ['gcash', 'cod'] : ['cod', 'gcash'] as $method) {
            $gcash = $method === 'gcash'
                ? collect($lines)->mapWithKeys(fn (Product $p) => [$p->seller_id => ['reference' => (string) mt_rand(1000000000000, 9999999999999), 'proof_path' => $this->receiptPath]])->all()
                : [];
            try {
                $result = $this->placer->place($buyer, [
                    'items' => $items, 'destination' => $destination, 'snapshot' => $snapshot, 'codes' => ['store' => [], 'platform' => null, 'shipping' => null],
                    'payment_method' => $method, 'notes' => $notes[mt_rand(0, count($notes) - 1)], 'source' => 'buy_now',
                    'expected_total' => null, 'high_value_agreed' => true, 'remote_delivery' => null,
                ], "showcase-{$buyer->id}-{$n}-{$method}", $gcash);
            } catch (ValidationException $e) {
                if (array_key_exists('payment_method', $e->errors())) {
                    continue; // COD over the limit: pay by GCash instead
                }
                $this->say('  checkout refused for ' . $buyer->username . ': ' . collect($e->errors())->flatten()->first());

                return null;
            } catch (HttpException) {
                return null;
            }

            return $result['repeated'] ? null : $result['orders']->first()?->load('items');
        }

        return null;
    }

    /** The order's whole trip, as the endpoints move it, ending with the buyer's confirmation. */
    private function deliver(Order $order, Carbon $placedAt): void
    {
        $cursor = $placedAt->copy();
        $step = function (string $name) use (&$cursor): Carbon {
            [$min, $max] = self::GAPS[$name];
            $cursor = $cursor->copy()->addMinutes(mt_rand($min, $max));
            // Never in the future: a late step happens an hour before now at the latest.
            if ($cursor->greaterThan($this->now->copy()->subHour())) {
                $cursor = $this->now->copy()->subHour();
            }
            Carbon::setTestNow($cursor);

            return $cursor;
        };

        $seller = User::find($order->items->first()->seller_id);
        $buyer = User::find($order->buyer_id);
        $companyId = \App\Models\LogisticsCompany::effectiveId($order->logistics_company_id);

        $step('confirm');
        if ($order->payment_method === 'gcash') {
            $order->forceFill(['payment_status' => 'paid', 'payment_verified_at' => now(), 'payment_verified_by' => $seller->id])->save();
            Payment::where('order_id', $order->id)->update(['status' => 'paid', 'paid_at' => now()]);
        }
        $this->move($order, OrderStatus::CONFIRMED, 'seller', $seller, $order->payment_method === 'cod' ? 'COD order confirmed by merchant' : 'Payment verified and confirmed by merchant');
        $step('prepare');
        $this->move($order, OrderStatus::PREPARING, 'seller', $seller, 'Seller is preparing the order.');
        $step('ready');
        $this->move($order, OrderStatus::READY_FOR_PICKUP, 'seller', $seller, 'Ready for pickup.');
        $parcel = Parcel::where('order_id', $order->id)->firstOrFail();

        $origin = $this->router->bestHubFor($companyId, (string) $parcel->pickup_barangay_code);
        $destination = $this->router->bestHubFor($companyId, (string) $parcel->destination_barangay_code) ?? $origin;
        $pickupRider = $origin ? $this->riderFor($origin, (string) $parcel->pickup_barangay_code) : null;
        $deliveryRider = $destination ? $this->riderFor($destination, (string) $parcel->destination_barangay_code) : null;
        if (! $origin || ! $destination || ! $pickupRider || ! $deliveryRider) {
            throw new RuntimeException("No hub or rider of the courier covers order {$order->order_number}.");
        }

        // The rider accepts the pickup (Dispatcher::accept); the automatic offer made at Ready for pickup is closed.
        DispatchOffer::where('parcel_id', $parcel->id)->delete();
        $parcel->forceFill([
            'pickup_rider_id' => $pickupRider->id, 'sorting_center_id' => $origin->id, 'pickup_accepted_at' => now()->addMinutes(mt_rand(5, 40)),
            'dispatch_state' => Parcel::DISPATCH_ASSIGNED,
        ])->save();

        $step('pickup');
        $this->move($order, OrderStatus::PICKED_UP, 'rider', $pickupRider->user, 'Picked up from the seller by the courier.', ['rider_id' => $pickupRider->id, 'tracking_number' => $parcel->tracking_number]);
        $parcel->forceFill(['picked_up_at' => now()])->save();
        DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $pickupRider->id, 'outcome' => DeliveryLog::OUTCOME_PICKED_UP, 'logged_at' => now()]);

        $step('intake');
        $this->move($order, OrderStatus::AT_SORTING_CENTER, 'hub', $origin->user, 'Received at the sorting center.', ['sorting_center_id' => $origin->id, 'tracking_number' => $parcel->tracking_number]);
        $parcel->forceFill(['scanned_in_at' => now()])->save();

        $step('sort');
        // Another hub covers the buyer: the courier's truck took the parcel there; that hub sorts and delivers it.
        $parcel->forceFill(['sorting_center_id' => $destination->id, 'sorted_at' => now()])->save();
        $this->move($order, OrderStatus::SORTED, 'hub', $destination->user, $origin->id === $destination->id ? 'Sorted at the sorting center.' : "Arrived from {$origin->hub_name} and sorted.", [
            'sorting_center_id' => $destination->id, 'tracking_number' => $parcel->tracking_number, 'barangay_code' => $parcel->destination_barangay_code,
        ]);

        $step('assign');
        $this->move($order, OrderStatus::ASSIGNED_TO_RIDER, 'hub', $destination->user, 'Assigned to a delivery rider.', ['sorting_center_id' => $destination->id, 'rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]);
        $parcel->forceFill(['assigned_rider_id' => $deliveryRider->id, 'assigned_at' => now()])->save();

        $step('start');
        $this->move($order, OrderStatus::OUT_FOR_DELIVERY, 'rider', $deliveryRider->user, 'Out for delivery with the courier.', ['rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]);
        $parcel->forceFill(['out_for_delivery_at' => now()])->save();

        $step('deliver');
        $parcel->refresh();
        $receivedBy = $parcel->recipient_snapshot['name'] ?? 'Recipient';
        $parcel->forceFill([
            'delivered_at' => now(), 'delivery_proof_path' => $this->proofPath, 'delivery_proof_path_2' => $this->proofPath,
            'received_by' => $receivedBy, 'cod_collected_at' => $parcel->cod_amount !== null ? now() : null,
        ])->save();
        $this->move($order, OrderStatus::DELIVERED, 'rider', $deliveryRider->user, 'Delivered to the recipient by the courier.', ['rider_id' => $deliveryRider->id, 'tracking_number' => $parcel->tracking_number]);
        DeliveryLog::create(['parcel_id' => $parcel->id, 'rider_id' => $deliveryRider->id, 'outcome' => DeliveryLog::OUTCOME_DELIVERED, 'logged_at' => now(), 'notes' => "Received by {$receivedBy}"]);
        if ($parcel->cod_amount !== null) {
            $this->cod[$deliveryRider->id] = ($this->cod[$deliveryRider->id] ?? 0) + (int) round((float) $parcel->cod_amount * 100);
        }

        $step('complete');
        $this->move($order, OrderStatus::COMPLETED, 'buyer', $buyer, 'Buyer confirmed receipt');
    }

    /** A rider of the hub who covers the barangay, or any rider of the hub. */
    private function riderFor(SortingCenter $hub, string $barangay): ?Rider
    {
        $this->riders[$hub->id] ??= Rider::with(['user', 'areas'])->where('sorting_center_id', $hub->id)
            ->where('status', Rider::STATUS_ACTIVE)->carriesParcels()->get()->all();
        $riders = $this->riders[$hub->id];
        $covering = array_values(array_filter($riders, fn (Rider $r) => $r->areas->contains(
            fn ($a) => $a->is_active && in_array($barangay, (array) $a->coverage_barangays, true)
        )));
        $pool = $covering ?: $riders;

        return $pool ? $pool[mt_rand(0, count($pool) - 1)] : null;
    }

    private function move(Order $order, OrderStatus $to, string $actor, ?User $user, string $note, array $meta = []): void
    {
        $this->machine->transition(Order::find($order->id), $to, $actor, $user?->id, $note, $meta);
    }

    /** Most delivered items get a review a day or two after the buyer confirmed; returns how many. */
    private function review(Order $order, array &$touched): int
    {
        $made = 0;
        foreach ($order->items as $item) {
            if (mt_rand(1, 100) > 78 || ! $item->product_id || Review::where('order_item_id', $item->id)->exists()) {
                continue;
            }
            $product = $this->products->get($item->product_id) ?? Product::with('category.parent')->find($item->product_id);
            $rating = $this->rating();
            $at = Carbon::now()->copy()->addHours(mt_rand(2, 60));
            if ($at->greaterThan($this->now)) {
                $at = $this->now->copy()->subMinutes(mt_rand(10, 300));
            }
            $reply = mt_rand(1, 100) <= ($rating <= 3 ? 70 : 25);
            $review = new Review();
            $review->forceFill([
                'buyer_id' => $order->buyer_id, 'product_id' => $item->product_id, 'order_id' => $order->id, 'order_item_id' => $item->id,
                'variant_label' => $item->variant_label, 'rating' => $rating, 'comment' => ShowcaseReviewText::comment($rating, $product?->category?->parent?->slug ?? $product?->category?->slug),
                'verified_purchase' => true, 'moderation_status' => 'visible', 'edit_count' => 0,
                'seller_reply' => $reply ? ShowcaseReviewText::reply($rating) : null,
                'seller_replied_at' => $reply ? $at->copy()->addHours(mt_rand(1, 30))->min($this->now) : null,
                'created_at' => $at, 'updated_at' => $at,
            ])->save();
            $touched[$item->product_id] = true;
            $made++;

            // A few other shoppers found it helpful.
            if (mt_rand(1, 100) <= 30) {
                $voters = User::where('username', 'like', 'buyer%')->where('email', 'like', '%@' . config('showcase.email_domain'))
                    ->whereKeyNot($order->buyer_id)->inRandomOrder()->limit(mt_rand(1, 6))->pluck('id');
                foreach ($voters as $voter) {
                    DB::table('review_helpful_votes')->insertOrIgnore(['review_id' => $review->id, 'user_id' => $voter, 'created_at' => $at, 'updated_at' => $at]);
                }
            }
        }

        return $made;
    }

    private function rating(): int
    {
        $roll = mt_rand(1, 100);

        return match (true) {
            $roll <= 56 => 5,
            $roll <= 84 => 4,
            $roll <= 93 => 3,
            $roll <= 97 => 2,
            default => 1,
        };
    }

    private function shopComment(User $buyer, int $sellerId): int
    {
        if (ShopReview::where('seller_id', $sellerId)->where('buyer_id', $buyer->id)->exists()) {
            return 0;
        }
        $tags = collect(ShopReview::TAGS)->shuffle()->take(mt_rand(1, 3))->values()->all();
        $at = Carbon::now()->copy()->addHours(mt_rand(3, 72))->min($this->now);
        $comment = new ShopReview();
        $comment->forceFill([
            'seller_id' => $sellerId, 'buyer_id' => $buyer->id, 'rating' => null, 'comment' => ShowcaseReviewText::shopComment(),
            'tags' => $tags, 'edit_count' => 0, 'created_at' => $at, 'updated_at' => $at,
        ])->save();

        return 1;
    }

    /** The riders handed the cash they collected to their courier, and the courier confirmed it. */
    private function remitCod(): void
    {
        foreach ($this->cod as $riderId => $cents) {
            $rider = Rider::with('sortingCenter.logisticsCompany.members')->find($riderId);
            $company = $rider?->companyId();
            if (! $rider || ! $company || $cents <= 0) {
                continue;
            }
            $owner = \App\Models\LogisticsCompanyMember::where('logistics_company_id', $company)->orderBy('id')->value('user_id');
            $at = $this->now->copy()->subDays(mt_rand(1, 3))->setTime(17, mt_rand(0, 59));
            CodRemittance::forceCreate([
                'rider_id' => $riderId, 'logistics_company_id' => $company,
                'amount' => number_format($cents / 100, 2, '.', ''), 'balance_at_submission' => number_format($cents / 100, 2, '.', ''),
                'status' => CodRemittance::STATUS_CONFIRMED, 'reference' => 'REM-' . strtoupper(substr(md5($riderId . $cents), 0, 8)),
                'submitted_at' => $at, 'confirmed_by' => $owner, 'confirmed_at' => $at->copy()->addHours(2),
                'created_at' => $at, 'updated_at' => $at->copy()->addHours(2),
            ]);
        }
    }

    /** A placeholder image shared by every seeded order (a delivery photo, a GCash receipt), made once. */
    private function file(string $disk, string $name, array $rgb): string
    {
        $path = trim((string) config('showcase.storage_prefix'), '/') . "/documents/{$name}.png";
        if (! Storage::disk($disk)->exists($path)) {
            Storage::disk($disk)->put($path, PlaceholderImage::png(480, 320, $rgb));
        }

        return $path;
    }

    private function say(string $line): void
    {
        if ($this->progress) {
            ($this->progress)($line);
        }
    }
}
