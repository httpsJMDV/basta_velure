<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\SellerProfile;
use App\Services\SettlementPayments;
use App\Support\Gcash;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin → Payments → Settlements. Loved-IT does not hold the money couriers and shops settle each week, so the admin
 * only sees the payments that went wrong: reported as not received, left unconfirmed past the window, or voided and
 * waiting to be sent again, plus a history of what admins decided.
 */
class AdminSettlementController extends Controller
{
    public const VIEWS = ['reported', 'overdue', 'voided', 'history'];

    public function __construct(private SettlementPayments $payments) {}

    /** GET /admin/settlements?view=reported|overdue|voided|history&page= */
    public function index(Request $request): JsonResponse
    {
        $view = $request->validate(['view' => ['nullable', 'in:' . implode(',', self::VIEWS)]])['view'] ?? 'reported';
        $page = $this->scoped(CourierSettlement::query(), $view)
            ->with(['company:id,name,code,logo_path,gcash_number,gcash_name'])
            ->orderByDesc($view === 'history' ? 'updated_at' : 'paid_at')->orderByDesc('id')
            ->paginate(20);

        $profiles = SellerProfile::whereIn('user_id', $page->getCollection()->pluck('seller_id')->unique())->get()->keyBy('user_id');

        return response()->json([
            'data'   => $page->getCollection()->map(fn (CourierSettlement $s) => $this->row($s, $profiles->get($s->seller_id)))->values(),
            'meta'   => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(),
                'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem(),
            ],
            'counts' => collect(['reported', 'overdue', 'voided'])->mapWithKeys(fn ($v) => [$v => $this->scoped(CourierSettlement::query(), $v)->count()]),
            'confirm_days' => CourierSettlement::confirmDays(),
        ]);
    }

    /** POST /admin/settlements/{settlement}/resolve {outcome: received|pay_again, note} */
    public function resolve(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $data = $request->validate([
            'outcome' => ['required', 'in:' . CourierSettlement::RESOLUTION_RECEIVED . ',' . CourierSettlement::RESOLUTION_PAY_AGAIN],
            'note'    => ['required', 'string', 'min:10', 'max:500'],
        ], [
            'note.required' => 'Write what you checked; both sides will read it.',
            'note.min'      => 'Write a little more (at least 10 characters); both sides will read it.',
        ]);
        $s = $this->payments->resolve($settlement, $request->user(), $data['outcome'], trim($data['note']));

        return response()->json([
            'message' => $data['outcome'] === CourierSettlement::RESOLUTION_RECEIVED ? 'Marked as received. Both sides were told.' : 'Payment voided. The payer was asked to send it again.',
            'data'    => $this->row($s->load('company'), SellerProfile::where('user_id', $s->seller_id)->first()),
        ]);
    }

    /** POST /admin/settlements/{settlement}/remind: asks the receiving side to confirm or report the payment. */
    public function remind(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $s = $this->payments->remind($settlement, $request->user());

        return response()->json([
            'message' => 'Reminder sent to ' . $this->payments->name($s, $s->receiverSide()) . '.',
            'data'    => $this->row($s->load('company'), SellerProfile::where('user_id', $s->seller_id)->first()),
        ]);
    }

    /** @param Builder<CourierSettlement> $q */
    private function scoped(Builder $q, string $view): Builder
    {
        return match ($view) {
            'reported' => $q->whereNull('confirmed_at')->whereNull('reopened_at')->whereNotNull('disputed_at'),
            'overdue'  => $q->whereNull('confirmed_at')->whereNull('reopened_at')->whereNull('disputed_at')
                ->where('paid_at', '<=', now()->subDays(CourierSettlement::confirmDays())),
            'voided'   => $q->whereNull('confirmed_at')->whereNotNull('reopened_at'),
            default    => $q->where(fn ($w) => $w->whereNotNull('resolved_at')->orWhereNotNull('attempts')),
        };
    }

    private function row(CourierSettlement $s, ?SellerProfile $shop): array
    {
        /** @var LogisticsCompany|null $company */
        $company = $s->company;
        $since = $s->disputed_at ?? $s->paid_at;

        return [
            ...SellerSettlementController::settlement($s),
            'week'          => ['start' => $s->period_start->toDateString(), 'end' => $s->period_end->toDateString()],
            'orders_count'  => $s->orders_count,
            'cod_collected' => (float) $s->cod_collected,
            'courier_fees'  => (float) $s->courier_fees,
            'days_waiting'  => $since && ! $s->confirmed_at ? (int) floor($since->diffInDays(now())) : null,
            'reminded_at'   => $s->reminded_at?->toIso8601String(),
            'can_remind'    => $s->state() === CourierSettlement::STATE_SENT && (! $s->reminded_at || $s->reminded_at->lte(now()->subDay())),
            'courier'       => $company ? [
                'id' => $company->id, 'name' => $company->name, 'code' => $company->code, 'logo_url' => $company->logo_url,
                'gcash' => $company->gcash_number ? ['name' => $company->gcash_name, 'number' => Gcash::format($company->gcash_number)] : null,
            ] : null,
            'shop'          => [
                'id' => $s->seller_id, 'name' => $shop?->shop_name ?? 'Shop', 'logo_url' => $shop?->logo_url,
                'gcash' => $shop?->gcash_number ? ['name' => $shop->gcash_account_name, 'number' => Gcash::format($shop->gcash_number)] : null,
            ],
            'attempts'      => collect($s->attempts ?? [])->values()->map(fn (array $a, int $i) => [
                'number'          => $i + 1,
                'reference'       => $a['reference'] ?? null,
                'amount'          => $a['amount'] ?? null,
                'paid_at'         => $a['paid_at'] ?? null,
                'has_receipt'     => ! empty($a['receipt_path']),
                'dispute_reason'  => $a['dispute_reason'] ?? null,
                'resolution_note' => $a['resolution_note'] ?? null,
                'voided_at'       => $a['voided_at'] ?? null,
            ])->all(),
        ];
    }
}
