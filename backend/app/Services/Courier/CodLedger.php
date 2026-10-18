<?php

namespace App\Services\Courier;

use App\Http\Controllers\Api\V1\LogisticsRiderController;
use App\Models\AuditLog;
use App\Models\CodRemittance;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\User;
use App\Services\Notifier;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Cash on delivery a rider holds for their courier company (A24, Rider R9, Logistics L9).
 *
 * A rider's balance is the COD they collected minus the remittances the company confirmed. A remittance the rider
 * submits stays Pending, and the balance does not change, until the company confirms it; only the company can
 * confirm. A remittance smaller than the balance is a shortfall: the company sees it flagged, and the rest stays on
 * the rider's balance. All sums are in whole centavos.
 */
class CodLedger
{
    /** @return array{collected: string, confirmed: string, pending: string, outstanding: string, can_remit: string} */
    public function balance(Rider $rider): array
    {
        $collected = $this->collectedCents($rider);
        $confirmed = Money::toCents((string) CodRemittance::where('rider_id', $rider->id)->where('status', CodRemittance::STATUS_CONFIRMED)->sum('amount'));
        $pending = Money::toCents((string) CodRemittance::where('rider_id', $rider->id)->where('status', CodRemittance::STATUS_PENDING)->sum('amount'));
        $outstanding = max(0, $collected - $confirmed);

        return [
            'collected'   => Money::fromCents($collected),
            'confirmed'   => Money::fromCents($confirmed),
            'pending'     => Money::fromCents($pending),
            'outstanding' => Money::fromCents($outstanding),
            'can_remit'   => Money::fromCents(max(0, $outstanding - $pending)),
        ];
    }

    private function collectedCents(Rider $rider, ?CarbonImmutable $from = null, ?CarbonImmutable $to = null): int
    {
        return (int) Parcel::where('assigned_rider_id', $rider->id)->whereNotNull('cod_collected_at')
            ->when($from, fn ($q) => $q->whereBetween('cod_collected_at', [$from, $to]))
            ->get(['cod_collected_amount', 'cod_amount'])
            ->sum(fn (Parcel $p) => Money::toCents((string) ($p->cod_collected_amount ?? $p->cod_amount ?? '0')));
    }

    /** The COD orders behind the balance, newest first. */
    public function collections(Rider $rider, ?CarbonImmutable $from = null, ?CarbonImmutable $to = null, int $limit = 100): array
    {
        return Parcel::with('order:id,order_number')->where('assigned_rider_id', $rider->id)->whereNotNull('cod_collected_at')
            ->when($from, fn ($q) => $q->whereBetween('cod_collected_at', [$from, $to]))
            ->latest('cod_collected_at')->limit($limit)->get()
            ->map(fn (Parcel $p) => [
                'tracking_number' => $p->tracking_number,
                'order_number'    => $p->order?->order_number,
                'amount'          => Money::fromCents(Money::toCents((string) ($p->cod_collected_amount ?? $p->cod_amount ?? '0'))),
                'collected_at'    => $p->cod_collected_at?->toIso8601String(),
            ])->all();
    }

    /** The rider hands cash to the company (R9): Pending until the company confirms it. */
    public function submit(Rider $rider, string $amount, ?string $reference, ?string $idempotencyKey): CodRemittance
    {
        return DB::transaction(function () use ($rider, $amount, $reference, $idempotencyKey) {
            Rider::whereKey($rider->id)->lockForUpdate()->first();
            if ($idempotencyKey && ($same = CodRemittance::where('idempotency_key', $idempotencyKey)->where('rider_id', $rider->id)->first())) {
                return $same;
            }
            abort_if(CodRemittance::where('rider_id', $rider->id)->where('status', CodRemittance::STATUS_PENDING)->exists(), 409,
                'You already have a remittance waiting for your company to confirm.');

            $cents = Money::toCents($amount);
            $balance = $this->balance($rider);
            $outstanding = Money::toCents($balance['outstanding']);
            abort_if($outstanding <= 0, 422, 'You have no cash on delivery to remit.');
            abort_if($cents > $outstanding, 422, 'You can remit at most ₱' . number_format($outstanding / 100, 2) . ', your current balance.');

            return CodRemittance::create([
                'rider_id' => $rider->id, 'logistics_company_id' => $rider->companyId(),
                'amount' => Money::fromCents($cents), 'balance_at_submission' => Money::fromCents($outstanding),
                'status' => CodRemittance::STATUS_PENDING, 'reference' => $reference ?: 'REM-' . Str::upper(Str::random(8)),
                'submitted_at' => now(), 'idempotency_key' => $idempotencyKey,
            ]);
        });
    }

    /** Only the company confirms (L9): the rider's balance goes down by the amount. */
    public function confirm(LogisticsCompany $company, int $remittanceId, User $by): CodRemittance
    {
        return DB::transaction(function () use ($company, $remittanceId, $by) {
            $riderIds = LogisticsRiderController::companyRiders($company)->pluck('id');
            $r = CodRemittance::whereIn('rider_id', $riderIds)->lockForUpdate()->find($remittanceId);
            abort_unless($r, 404, 'Remittance not found.');
            abort_unless($r->status === CodRemittance::STATUS_PENDING, 409, 'This remittance is already confirmed.');

            $r->forceFill(['status' => CodRemittance::STATUS_CONFIRMED, 'confirmed_by' => $by->id, 'confirmed_at' => now()])->save();
            $short = Money::toCents((string) $r->balance_at_submission) - Money::toCents((string) $r->amount);
            AuditLog::record($by, 'cod.remittance_confirmed', $r, ['status' => CodRemittance::STATUS_PENDING],
                ['status' => CodRemittance::STATUS_CONFIRMED, 'amount' => (float) $r->amount, 'shortfall' => max(0, $short) / 100], null, $company->id, 'logistics');

            $rider = Rider::with('user')->find($r->rider_id);
            app(Notifier::class)->send($rider?->user, 'rider.remittance_confirmed', 'Remittance confirmed',
                "Your company confirmed your ₱{$r->amount} remittance ({$r->reference})." . ($short > 0 ? ' ₱' . number_format($short / 100, 2) . ' is still on your balance.' : ''),
                '/rider/earnings');

            return $r->fresh();
        });
    }

    /**
     * One day of COD per rider (L9): what each rider collected that day, what they remitted that day, the
     * difference, and the remittances still waiting, each with its shortfall.
     */
    public function reconciliation(LogisticsCompany $company, string $date): array
    {
        $day = CarbonImmutable::parse($date, 'Asia/Manila');
        $from = $day->startOfDay()->utc();
        $to = $day->endOfDay()->utc();
        $riders = LogisticsRiderController::companyRiders($company)->with('user')->get();

        $rows = [];
        $totals = ['collected' => 0, 'remitted' => 0];
        foreach ($riders as $rider) {
            $collected = $this->collectedCents($rider, $from, $to);
            $remittances = CodRemittance::where('rider_id', $rider->id)->whereBetween('submitted_at', [$from, $to])->orderBy('submitted_at')->get();
            $remitted = $remittances->sum(fn ($r) => Money::toCents((string) $r->amount));
            if ($collected === 0 && $remitted === 0) {
                continue;
            }
            $totals['collected'] += $collected;
            $totals['remitted'] += $remitted;
            $rows[] = [
                'rider_id'    => $rider->id,
                'rider'       => $rider->user ? trim($rider->user->first_name . ' ' . $rider->user->last_name) : 'Rider #' . $rider->id,
                'collected'   => Money::fromCents($collected),
                'remitted'    => Money::fromCents($remitted),
                'difference'  => Money::fromCents($remitted - $collected),
                'shortfall'   => $remitted < $collected,
                'balance'     => $this->balance($rider)['outstanding'],
                'orders'      => $this->collections($rider, $from, $to),
                'remittances' => $remittances->map(fn ($r) => $this->present($r))->all(),
            ];
        }

        $pending = CodRemittance::with('rider.user')->whereIn('rider_id', $riders->pluck('id'))->where('status', CodRemittance::STATUS_PENDING)
            ->orderBy('submitted_at')->get()->map(fn ($r) => $this->present($r))->all();

        return [
            'date'    => $day->toDateString(),
            'riders'  => $rows,
            'totals'  => [
                'collected' => Money::fromCents($totals['collected']), 'remitted' => Money::fromCents($totals['remitted']),
                'difference' => Money::fromCents($totals['remitted'] - $totals['collected']),
            ],
            'pending' => $pending,
        ];
    }

    public function present(CodRemittance $r): array
    {
        $short = Money::toCents((string) $r->balance_at_submission) - Money::toCents((string) $r->amount);
        $u = $r->relationLoaded('rider') ? $r->rider?->user : null;

        return [
            'id'                    => $r->id,
            'rider_id'              => $r->rider_id,
            'rider'                 => $u ? trim($u->first_name . ' ' . $u->last_name) : null,
            'amount'                => Money::fromCents(Money::toCents((string) $r->amount)),
            'balance_at_submission' => Money::fromCents(Money::toCents((string) $r->balance_at_submission)),
            'shortfall'             => Money::fromCents(max(0, $short)),
            'status'                => $r->status,
            'reference'             => $r->reference,
            'submitted_at'          => $r->submitted_at?->toIso8601String(),
            'confirmed_at'          => $r->confirmed_at?->toIso8601String(),
        ];
    }
}
