<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FlashSale;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\StoreSale;
use App\Services\Pricing\PriceBook;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The seller's promotions (Seller workbook S8 and S10, A5, A8, A28): store sales with a start and an end, flash sales
 * in two-hour slots with their own quantity, bundle deals and buy X get Y. All are seller-funded. Times are entered
 * and shown in Philippine time.
 */
class SellerPromotionController extends Controller
{
    private const TZ = 'Asia/Manila';

    /** A store sale or promotion runs at most this long, so a mistyped year (2027 for 2026) cannot run for a year. */
    public const MAX_RUN_DAYS = 90;

    /** GET /seller/promotions: every sale, flash sale, bundle and buy X get Y of the store with its status. */
    public function index(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $now = now();

        $sales = StoreSale::with('product.variants')->where('seller_id', $sellerId)->latest('starts_at')->limit(200)->get();
        $flash = FlashSale::with(['product', 'variant'])->where('seller_id', $sellerId)->latest('slot_start')->limit(200)->get();
        $promos = Promotion::with(['products:id,name', 'buyProduct:id,name', 'getProduct:id,name'])->where('seller_id', $sellerId)->latest('starts_at')->limit(200)->get();

        return response()->json(['data' => [
            'sales' => $sales->map(fn (StoreSale $s) => $this->saleRow($s, $now))->values(),
            'flash_sales' => $flash->map(fn (FlashSale $f) => $this->flashRow($f, $now))->values(),
            'bundles' => $promos->where('type', Promotion::TYPE_BUNDLE)->map(fn ($p) => $this->promoRow($p, $now))->values(),
            'bxgy' => $promos->where('type', Promotion::TYPE_BXGY)->map(fn ($p) => $this->promoRow($p, $now))->values(),
            'slots' => $this->upcomingSlots(),
        ]]);
    }

    // ─── Store sales ─────────────────────────────────────────────────────────

    /** POST /seller/sales {product_id, discount_type, discount_percent?, sale_price?, starts_at, ends_at} */
    public function storeSale(Request $request): JsonResponse
    {
        $product = $this->ownProduct($request, (int) $request->input('product_id'));
        $data = $this->validateSale($request, $product, null);

        $sale = DB::transaction(function () use ($product, $data) {
            $this->assertNoOverlap($product, $data['starts_at'], $data['ends_at'], null);

            return StoreSale::create([
                'seller_id' => $product->seller_id, 'product_id' => $product->id,
                'discount_type' => $data['discount_type'], 'discount_percent' => $data['discount_percent'] ?? null,
                'sale_price' => $data['sale_price'] ?? null, 'starts_at' => $data['starts_at'], 'ends_at' => $data['ends_at'],
            ]);
        });

        return response()->json(['message' => 'Sale saved.', 'data' => $this->saleRow($sale->load('product.variants'), now())], 201);
    }

    /**
     * PATCH /seller/sales/{sale}: an upcoming sale can change everything; a running sale can change its discount and
     * end (A28: the new discount applies to new orders at once, orders already placed keep their price).
     */
    public function updateSale(Request $request, int $sale): JsonResponse
    {
        $s = StoreSale::with('product.variants')->where('seller_id', $request->user()->id)->findOrFail($sale);
        $status = $s->statusAt();
        abort_if($status === 'ended', 409, 'This sale has ended and cannot be changed.');

        if ($status === 'ongoing') {
            $request->merge(['starts_at' => $s->starts_at->clone()->setTimezone(self::TZ)->format('Y-m-d H:i')]);
        }
        $data = $this->validateSale($request, $s->product, $s);
        DB::transaction(function () use ($s, $data) {
            $this->assertNoOverlap($s->product, $data['starts_at'], $data['ends_at'], $s->id);
            $s->update([
                'discount_type' => $data['discount_type'], 'discount_percent' => $data['discount_percent'] ?? null,
                'sale_price' => $data['sale_price'] ?? null, 'starts_at' => $data['starts_at'], 'ends_at' => $data['ends_at'],
            ]);
        });

        return response()->json(['message' => 'Sale updated. Buyers see the new price now.', 'data' => $this->saleRow($s->fresh('product.variants'), now())]);
    }

    /** POST /seller/sales/{sale}/end: ends a running or upcoming sale at once. */
    public function endSale(Request $request, int $sale): JsonResponse
    {
        $s = StoreSale::with('product.variants')->where('seller_id', $request->user()->id)->findOrFail($sale);
        abort_if($s->statusAt() === 'ended', 409, 'This sale has already ended.');
        $s->update(['ended_at' => now()]);

        return response()->json(['message' => 'Sale ended. Buyers see the regular price now.', 'data' => $this->saleRow($s, now())]);
    }

    private function validateSale(Request $request, Product $product, ?StoreSale $editing): array
    {
        $data = $request->validate([
            'discount_type'    => ['required', 'in:percent,fixed'],
            'discount_percent' => ['required_if:discount_type,percent', 'nullable', 'integer', 'min:1', 'max:99'],
            'sale_price'       => ['required_if:discount_type,fixed', 'nullable', 'numeric', 'decimal:0,2', 'min:1'],
            'starts_at'        => ['required', 'date'],
            'ends_at'          => ['required', 'date'],
        ], [
            'discount_percent.required_if' => 'Enter the discount percentage.',
            'discount_percent.integer'     => 'Use a whole percentage from 1% to 99%.',
            'discount_percent.min'         => 'The discount must be from 1% to 99%.',
            'discount_percent.max'         => 'The discount must be from 1% to 99%.',
            'sale_price.required_if'       => 'Enter the sale price.',
            'sale_price.decimal'           => 'The sale price can have at most 2 decimal places.',
            'sale_price.min'               => 'The sale price must be at least ₱1.00.',
        ]);

        $start = $this->manila($data['starts_at']);
        $end = $this->manila($data['ends_at']);
        $errors = [];
        if (! $editing || $editing->statusAt() === 'upcoming') {
            if ($start->lt(now()->subMinute())) {
                $errors['starts_at'] = 'The start cannot be in the past.';
            }
        }
        if ($end->lte($start)) {
            $errors['ends_at'] = 'The end must be after the start.';
        } elseif ($end->gt($start->addDays(self::MAX_RUN_DAYS))) {
            $errors['ends_at'] = self::tooLong($start);
        }

        if ($data['discount_type'] === 'fixed') {
            $prices = $product->variants->pluck('price')->map(fn ($p) => (float) $p)->unique();
            if ($prices->count() > 1) {
                $errors['discount_type'] = 'This product has several prices. Use a percentage discount instead.';
            } elseif ((float) $data['sale_price'] >= (float) $prices->first()) {
                $errors['sale_price'] = 'The sale price must be below the regular price of ₱' . number_format((float) $prices->first(), 2) . '.';
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $data['starts_at'] = $start->utc();
        $data['ends_at'] = $end->utc();

        return $data;
    }

    private function assertNoOverlap(Product $product, $start, $end, ?int $exceptId): void
    {
        $clash = StoreSale::where('product_id', $product->id)
            ->whereNull('ended_at')
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->where('starts_at', '<', $end)
            ->where('ends_at', '>', $start)
            ->lockForUpdate()
            ->first();
        if ($clash) {
            throw ValidationException::withMessages(['starts_at' => "{$product->name} already has a sale from "
                . $clash->starts_at->setTimezone(self::TZ)->format('M j, g:i A') . ' to '
                . $clash->ends_at->setTimezone(self::TZ)->format('M j, g:i A') . '. A product can be in one sale at a time.']);
        }
    }

    // ─── Flash sales ─────────────────────────────────────────────────────────

    /** POST /seller/flash-sales {product_id, product_variant_id?, slot_date, slot_hour, flash_price, quantity} */
    public function storeFlash(Request $request): JsonResponse
    {
        $product = $this->ownProduct($request, (int) $request->input('product_id'));
        $data = $request->validate([
            'product_variant_id' => ['nullable', 'integer'],
            'slot_date'          => ['required', 'date_format:Y-m-d'],
            'slot_hour'          => ['required', 'integer', 'in:0,2,4,6,8,10,12,14,16,18,20,22'],
            'flash_price'        => ['required', 'numeric', 'decimal:0,2', 'min:1'],
            'quantity'           => ['required', 'integer', 'min:1', 'max:99999'],
        ], [
            'slot_hour.in'       => 'Choose one of the two-hour slots.',
            'flash_price.min'    => 'The flash price must be at least ₱1.00.',
            'flash_price.decimal' => 'The flash price can have at most 2 decimal places.',
            'quantity.min'       => 'The flash quantity must be at least 1.',
            'quantity.integer'   => 'The flash quantity must be a whole number.',
        ]);

        $variants = $product->variants;
        $variant = ! empty($data['product_variant_id']) ? $variants->firstWhere('id', (int) $data['product_variant_id']) : ($variants->count() === 1 ? $variants->first() : null);
        if (! $variant) {
            throw ValidationException::withMessages(['product_variant_id' => 'Choose which variant goes on flash sale.']);
        }

        $start = CarbonImmutable::createFromFormat('Y-m-d H:i', $data['slot_date'] . ' ' . sprintf('%02d:00', $data['slot_hour']), self::TZ);
        $end = $start->addHours(FlashSale::SLOT_HOURS);
        $errors = [];
        if ($end->lte(now())) {
            $errors['slot_hour'] = 'This slot has already ended. Choose a later slot.';
        }
        if ((float) $data['flash_price'] >= (float) $variant->price) {
            $errors['flash_price'] = 'The flash price must be below the regular price of ₱' . number_format((float) $variant->price, 2) . '.';
        }
        if ((int) $data['quantity'] > $variant->stock_quantity) {
            $errors['quantity'] = "The flash quantity cannot be more than the {$variant->stock_quantity} in stock.";
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $flash = DB::transaction(function () use ($product, $variant, $start, $end, $data) {
            $clash = FlashSale::where('product_id', $product->id)->whereNull('ended_at')
                ->where(fn ($q) => $q->whereNull('product_variant_id')->orWhere('product_variant_id', $variant->id))
                ->where('slot_start', '<', $end->utc())->where('slot_end', '>', $start->utc())->lockForUpdate()->exists();
            if ($clash) {
                throw ValidationException::withMessages(['slot_hour' => 'This product already has a flash sale in that slot.']);
            }

            return FlashSale::create([
                'seller_id' => $product->seller_id, 'product_id' => $product->id, 'product_variant_id' => $variant->id,
                'slot_start' => $start->utc(), 'slot_end' => $end->utc(), 'flash_price' => $data['flash_price'], 'quantity' => $data['quantity'],
            ]);
        });

        return response()->json(['message' => 'Flash sale saved.', 'data' => $this->flashRow($flash->load(['product', 'variant']), now())], 201);
    }

    /** POST /seller/flash-sales/{flash}/end */
    public function endFlash(Request $request, int $flash): JsonResponse
    {
        $f = FlashSale::with(['product', 'variant'])->where('seller_id', $request->user()->id)->findOrFail($flash);
        abort_if($f->statusAt() === 'ended', 409, 'This flash sale has already ended.');
        $f->update(['ended_at' => now()]);

        return response()->json(['message' => 'Flash sale ended.', 'data' => $this->flashRow($f, now())]);
    }

    // ─── Bundles and buy X get Y ─────────────────────────────────────────────

    /** POST /seller/promotions {type: bundle|bxgy, ...} */
    public function storePromotion(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $type = $request->input('type');
        $rules = [
            'type'      => ['required', 'in:bundle,bxgy'],
            'name'      => \App\Support\Validation::displayName(3, 80),
            'starts_at' => ['required', 'date'],
            'ends_at'   => ['required', 'date'],
        ];
        if ($type === 'bundle') {
            $rules += [
                'product_ids'      => ['required', 'array', 'min:1', 'max:50'],
                'product_ids.*'    => ['integer', 'distinct'],
                'min_quantity'     => ['required', 'integer', 'min:2', 'max:99'],
                'discount_percent' => ['required', 'integer', 'min:1', 'max:99'],
            ];
        } else {
            $rules += [
                'buy_product_id' => ['required', 'integer'],
                'buy_quantity'   => ['required', 'integer', 'min:1', 'max:99'],
                'get_product_id' => ['required', 'integer'],
                'get_quantity'   => ['required', 'integer', 'min:1', 'max:99'],
            ];
        }
        $data = $request->validate($rules, \App\Support\Validation::displayNameMessages('name', 'The name', 3, 80) + [
            'min_quantity.min'     => 'A bundle needs at least 2 items.',
            'discount_percent.min' => 'The discount must be from 1% to 99%.',
            'discount_percent.max' => 'The discount must be from 1% to 99%.',
        ]);

        $start = $this->manila($data['starts_at']);
        $end = $this->manila($data['ends_at']);
        if ($start->lt(now()->subMinute())) {
            throw ValidationException::withMessages(['starts_at' => 'The start cannot be in the past.']);
        }
        if ($end->lte($start)) {
            throw ValidationException::withMessages(['ends_at' => 'The end must be after the start.']);
        }
        if ($end->gt($start->addDays(self::MAX_RUN_DAYS))) {
            throw ValidationException::withMessages(['ends_at' => self::tooLong($start)]);
        }
        $ids = $type === 'bundle' ? $data['product_ids'] : [$data['buy_product_id'], $data['get_product_id']];
        if (Product::where('seller_id', $sellerId)->whereIn('id', array_unique($ids))->count() !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['product_ids' => 'Choose products from your own store.']);
        }

        $promo = DB::transaction(function () use ($sellerId, $data, $type, $start, $end) {
            $promo = Promotion::create([
                'seller_id' => $sellerId, 'type' => $type, 'name' => trim($data['name']),
                'min_quantity' => $data['min_quantity'] ?? null, 'discount_percent' => $data['discount_percent'] ?? null,
                'buy_product_id' => $data['buy_product_id'] ?? null, 'buy_quantity' => $data['buy_quantity'] ?? null,
                'get_product_id' => $data['get_product_id'] ?? null, 'get_quantity' => $data['get_quantity'] ?? null,
                'starts_at' => $start->utc(), 'ends_at' => $end->utc(),
            ]);
            if ($type === 'bundle') {
                $promo->products()->sync($data['product_ids']);
            }

            return $promo;
        });

        return response()->json(['message' => 'Promotion saved.', 'data' => $this->promoRow($promo->load(['products:id,name', 'buyProduct:id,name', 'getProduct:id,name']), now())], 201);
    }

    /** POST /seller/promotions/{promotion}/end */
    public function endPromotion(Request $request, int $promotion): JsonResponse
    {
        $p = Promotion::with(['products:id,name', 'buyProduct:id,name', 'getProduct:id,name'])->where('seller_id', $request->user()->id)->findOrFail($promotion);
        abort_if($p->statusAt() === 'ended', 409, 'This promotion has already ended.');
        $p->update(['ended_at' => now()]);

        return response()->json(['message' => 'Promotion ended.', 'data' => $this->promoRow($p, now())]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function ownProduct(Request $request, int $id): Product
    {
        $product = Product::with('variants')->where('seller_id', $request->user()->id)->find($id);
        if (! $product) {
            throw ValidationException::withMessages(['product_id' => 'Choose one of your products.']);
        }

        return $product;
    }

    private static function tooLong(CarbonImmutable $start): string
    {
        return 'A sale can run for at most ' . self::MAX_RUN_DAYS . ' days. Choose an end on or before '
            . $start->addDays(self::MAX_RUN_DAYS)->setTimezone(self::TZ)->format('M j, Y g:i A') . '.';
    }

    /** "2026-10-18 14:00" or an ISO string, read in Manila time. */
    private function manila(string $value): CarbonImmutable
    {
        return preg_match('/(Z|[+-]\d{2}:?\d{2})$/', $value)
            ? CarbonImmutable::parse($value)->setTimezone(self::TZ)
            : CarbonImmutable::parse($value, self::TZ);
    }

    /** The two-hour slots from the current one to the end of tomorrow, for the flash sale form. */
    private function upcomingSlots(): array
    {
        $now = CarbonImmutable::now(self::TZ);
        $start = $now->setTime(intdiv((int) $now->format('G'), 2) * 2, 0);
        $slots = [];
        for ($t = $start; $t->lt($now->addDays(2)->startOfDay()); $t = $t->addHours(2)) {
            $slots[] = ['date' => $t->format('Y-m-d'), 'hour' => (int) $t->format('G'), 'label' => $t->format('D, M j') . ' · ' . $t->format('g:i A') . ' to ' . $t->addHours(2)->format('g:i A')];
        }

        return $slots;
    }

    private function saleRow(StoreSale $s, $now): array
    {
        $book = PriceBook::for([$s->product_id], $s->starts_at->gt($now) ? $s->starts_at->copy()->addSecond() : $now);
        $product = $s->product;

        return [
            'id' => $s->id, 'product_id' => $s->product_id, 'product_name' => $product?->name,
            'discount_type' => $s->discount_type, 'discount_percent' => $s->discount_percent,
            'sale_price' => $s->sale_price !== null ? (float) $s->sale_price : null,
            'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->ends_at->toIso8601String(),
            'ended_at' => $s->ended_at?->toIso8601String(), 'status' => $s->statusAt($now),
            // What each variant costs during the sale (the preview).
            'prices' => $product ? $product->variants->map(fn ($v) => [
                'variant_id' => $v->id, 'label' => $v->label, 'regular' => (float) $v->price,
                'sale' => $s->discount_type === 'fixed' && $s->sale_price !== null ? (float) $s->sale_price : PriceBook::percentOff((float) $v->price, (int) $s->discount_percent),
            ])->values() : [],
        ];
    }

    private function flashRow(FlashSale $f, $now): array
    {
        return [
            'id' => $f->id, 'product_id' => $f->product_id, 'product_name' => $f->product?->name,
            'variant_id' => $f->product_variant_id, 'variant_label' => $f->variant?->label,
            'regular_price' => (float) ($f->variant?->price ?? 0), 'flash_price' => (float) $f->flash_price,
            'quantity' => $f->quantity, 'sold' => $f->sold, 'remaining' => $f->remaining(),
            'slot_start' => $f->slot_start->toIso8601String(), 'slot_end' => $f->slot_end->toIso8601String(),
            'ended_at' => $f->ended_at?->toIso8601String(), 'status' => $f->statusAt($now),
        ];
    }

    private function promoRow(Promotion $p, $now): array
    {
        return [
            'id' => $p->id, 'type' => $p->type, 'name' => $p->name, 'status' => $p->statusAt($now),
            'min_quantity' => $p->min_quantity, 'discount_percent' => $p->discount_percent,
            'products' => $p->type === Promotion::TYPE_BUNDLE ? $p->products->map(fn ($x) => ['id' => $x->id, 'name' => $x->name])->values() : [],
            'buy_product' => $p->buyProduct ? ['id' => $p->buyProduct->id, 'name' => $p->buyProduct->name] : null,
            'buy_quantity' => $p->buy_quantity,
            'get_product' => $p->getProduct ? ['id' => $p->getProduct->id, 'name' => $p->getProduct->name] : null,
            'get_quantity' => $p->get_quantity,
            'starts_at' => $p->starts_at->toIso8601String(), 'ends_at' => $p->ends_at->toIso8601String(),
            'ended_at' => $p->ended_at?->toIso8601String(),
        ];
    }
}
