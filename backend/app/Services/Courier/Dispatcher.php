<?php

namespace App\Services\Courier;

use App\Http\Controllers\Api\V1\LogisticsRiderController;
use App\Models\AuditLog;
use App\Models\DispatchOffer;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\User;
use App\Services\Commerce\ShippingCalculator;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use App\Services\RiderWorkload;
use App\Support\PhRegions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Who picks a parcel up (A14, Logistics L4, Rider R4).
 *
 * A parcel that becomes Ready for Pickup is offered to the nearest eligible rider of its courier company for
 * 60 seconds. Eligible means Active, Online (heard from in the last 30 minutes) and holding fewer than 3 active jobs.
 * Nearest is by address: a rider whose delivery area covers the shop's barangay first, then the same city, province
 * and region; a tie goes to the rider with fewer jobs, then the one Online longest. A decline or an expired offer
 * moves the job to the next rider; after 3 of them it waits in the company's Unassigned queue and is no longer
 * offered on its own. The company can run auto-assign again, or assign, bulk-assign and reassign by hand until the
 * parcel is picked up.
 *
 * Every change locks the parcel row first, so a rider accepting and the company assigning at the same moment end
 * with exactly one rider.
 */
class Dispatcher
{
    public function __construct(
        private readonly RiderWorkload $workload,
        private readonly OrderStateMachine $machine,
    ) {}

    // ── Eligibility and ranking ──────────────────────────────────────────────

    /**
     * The company's riders who can take a job now, nearest first.
     *
     * @param  array<int>  $exclude  rider ids to leave out
     * @return Collection<int, array{rider: Rider, tier: int, distance: string, active_jobs: int}>
     */
    public function eligibleRiders(Parcel $parcel, array $exclude = []): Collection
    {
        $company = $this->company($parcel);
        if (! $company) {
            return collect();
        }

        $riders = LogisticsRiderController::companyRiders($company)
            ->with(['user', 'sortingCenter', 'areaAssignments' => fn ($q) => $q->where('is_active', true)])
            ->where('status', Rider::STATUS_ACTIVE)
            ->where('is_online', true)
            ->where('last_seen_at', '>', now()->subMinutes(Rider::PRESENCE_TIMEOUT_MINUTES))
            ->when($exclude !== [], fn ($q) => $q->whereNotIn('id', $exclude))
            ->get();
        $jobs = $this->workload->activeJobCounts($riders->pluck('id'));

        return $riders
            ->filter(fn (Rider $r) => ($jobs[$r->id] ?? 0) < Rider::MAX_ACTIVE_JOBS)
            ->map(function (Rider $r) use ($parcel, $jobs) {
                $tier = $this->tier($r, (string) $parcel->pickup_barangay_code);

                return ['rider' => $r, 'tier' => $tier, 'distance' => self::TIER_LABELS[$tier], 'active_jobs' => (int) ($jobs[$r->id] ?? 0)];
            })
            ->sort(fn ($a, $b) => [$a['tier'], $a['active_jobs'], $a['rider']->online_at?->getTimestamp() ?? PHP_INT_MAX, $a['rider']->id]
                <=> [$b['tier'], $b['active_jobs'], $b['rider']->online_at?->getTimestamp() ?? PHP_INT_MAX, $b['rider']->id])
            ->values();
    }

    public const TIER_LABELS = ['Covers the shop\'s barangay', 'Same city', 'Same province', 'Same region', 'Farther away'];

    /** 0 = the rider's area covers the barangay, 1 = same city, 2 = same province, 3 = same region, 4 = farther. */
    private function tier(Rider $rider, string $barangayCode): int
    {
        $codes = $rider->areaAssignments->flatMap(fn ($a) => $a->coverage_barangays ?? [])->map(fn ($c) => trim((string) $c))->filter()->values();
        if ($codes->isEmpty()) {
            $codes = collect($rider->sortingCenter?->coverage_barangays ?? [])->map(fn ($c) => trim((string) $c))->filter()->values();
        }
        if ($barangayCode === '' || $codes->isEmpty()) {
            return 4;
        }
        if ($codes->contains($barangayCode)) {
            return 0;
        }
        foreach ([
            1 => fn ($c) => ShippingCalculator::cityKey($c),
            2 => fn ($c) => PhRegions::provinceKey($c),
            3 => fn ($c) => PhRegions::regionOf($c),
        ] as $tier => $key) {
            $target = $key($barangayCode);
            if ($target !== null && $codes->contains(fn ($c) => $key($c) === $target)) {
                return $tier;
            }
        }

        return 4;
    }

    /** Why this rider cannot take a job right now, or null when they can (manual assignment, L4). */
    public function riderProblem(Rider $rider, Parcel $parcel): ?string
    {
        $company = $this->company($parcel);
        if (! $company || ! LogisticsRiderController::companyRiders($company)->whereKey($rider->id)->exists()) {
            return 'This rider is not one of your riders.';
        }

        return match (true) {
            $rider->status === Rider::STATUS_SUSPENDED => 'This rider is suspended.',
            $rider->status !== Rider::STATUS_ACTIVE    => 'This rider is not verified yet.',
            ! $rider->isAvailable()                    => 'This rider is Offline.',
            $this->workload->activeJobs($rider) >= Rider::MAX_ACTIVE_JOBS => 'This rider already has ' . Rider::MAX_ACTIVE_JOBS . ' active jobs, the most a rider can hold.',
            default => null,
        };
    }

    // ── Offers ───────────────────────────────────────────────────────────────

    /**
     * Offers the parcel to the next nearest eligible rider. Call with the parcel row locked, inside a transaction.
     * Returns the new offer, or null when the parcel went to (or stays in) the Unassigned queue.
     */
    public function offerNext(Parcel $parcel): ?DispatchOffer
    {
        if ($parcel->status !== Parcel::STATUS_READY_FOR_PICKUP || $parcel->pickup_rider_id) {
            return null;
        }
        if ($parcel->dispatch_attempts >= DispatchOffer::MAX_ATTEMPTS) {
            $parcel->forceFill(['dispatch_state' => Parcel::DISPATCH_UNASSIGNED])->save();

            return null;
        }

        // Riders who already turned this job down (or let it expire), and riders with another offer open.
        $tried = DispatchOffer::where('parcel_id', $parcel->id)->pluck('rider_id')->all();
        $busy = DispatchOffer::where('status', DispatchOffer::STATUS_OFFERED)->where('expires_at', '>', now())->pluck('rider_id')->all();
        $next = $this->eligibleRiders($parcel, array_values(array_unique([...$tried, ...$busy])))->first();

        if (! $next) {
            $parcel->forceFill(['dispatch_state' => Parcel::DISPATCH_UNASSIGNED])->save();

            return null;
        }

        $offer = DispatchOffer::create([
            'parcel_id' => $parcel->id, 'rider_id' => $next['rider']->id, 'status' => DispatchOffer::STATUS_OFFERED,
            'offered_at' => now(), 'expires_at' => now()->addSeconds(DispatchOffer::TTL_SECONDS),
        ]);
        $parcel->forceFill(['dispatch_state' => Parcel::DISPATCH_OFFERING])->save();
        app(Notifier::class)->jobOffered($next['rider'], $parcel, DispatchOffer::TTL_SECONDS);

        return $offer;
    }

    /** A parcel just became Ready for Pickup: start offering it. */
    public function start(Parcel $parcel): ?DispatchOffer
    {
        return DB::transaction(function () use ($parcel) {
            $locked = Parcel::lockForUpdate()->find($parcel->id);

            return $locked ? $this->offerNext($locked) : null;
        });
    }

    /** The company runs auto-assign (L4): a fresh round of offers for each job nobody holds. */
    public function autoAssign(LogisticsCompany $company, ?array $parcelIds = null): array
    {
        $this->expireDue();
        $ids = LogisticsCompany::constrain(Parcel::query(), $company->id)
            ->where('status', Parcel::STATUS_READY_FOR_PICKUP)->whereNull('pickup_rider_id')
            ->where(fn ($q) => $q->whereNull('dispatch_state')->orWhere('dispatch_state', '!=', Parcel::DISPATCH_OFFERING))
            ->when($parcelIds !== null, fn ($q) => $q->whereIn('id', $parcelIds))
            ->orderBy('ready_at')->pluck('id');

        $offered = 0;
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$offered) {
                $parcel = Parcel::lockForUpdate()->find($id);
                if (! $parcel) {
                    return;
                }
                $parcel->forceFill(['dispatch_attempts' => 0])->save();
                if ($this->offerNext($parcel)) {
                    $offered++;
                }
            });
        }

        return ['offered' => $offered, 'unassigned' => $ids->count() - $offered];
    }

    /** The rider accepts an offer (R4). */
    public function accept(Rider $rider, int $offerId): Parcel
    {
        // Expire first, in its own transactions, so a late accept still moves the job on before it is refused.
        $this->expireDue();

        return DB::transaction(function () use ($rider, $offerId) {
            $offer = DispatchOffer::where('rider_id', $rider->id)->findOrFail($offerId);
            $parcel = Parcel::with('order')->lockForUpdate()->findOrFail($offer->parcel_id);
            $offer = DispatchOffer::lockForUpdate()->findOrFail($offerId);

            if ($offer->status === DispatchOffer::STATUS_EXPIRED || ($offer->status === DispatchOffer::STATUS_OFFERED && $offer->expires_at->lte(now()))) {
                abort(409, 'This offer has expired. The job went to the next rider.');
            }
            if ($offer->status === DispatchOffer::STATUS_DECLINED) {
                abort(409, 'You declined this job.');
            }
            if ($offer->status !== DispatchOffer::STATUS_OFFERED || $parcel->pickup_rider_id || $parcel->status !== Parcel::STATUS_READY_FOR_PICKUP) {
                abort(409, 'This job is already assigned to another rider.');
            }
            if (! $rider->isAvailable()) {
                abort(409, 'Go Online to accept jobs.');
            }
            if ($this->workload->activeJobs($rider) >= Rider::MAX_ACTIVE_JOBS) {
                abort(409, 'You already have ' . Rider::MAX_ACTIVE_JOBS . ' active jobs. Finish one before accepting another.');
            }

            $offer->update(['status' => DispatchOffer::STATUS_ACCEPTED, 'responded_at' => now()]);
            $this->give($parcel, $rider, null, 'Accepted the pickup offer');

            return $parcel->fresh();
        });
    }

    /** The rider declines an offer (R4): it goes to the next rider. */
    public function decline(Rider $rider, int $offerId): void
    {
        DB::transaction(function () use ($rider, $offerId) {
            $offer = DispatchOffer::where('rider_id', $rider->id)->findOrFail($offerId);
            $parcel = Parcel::lockForUpdate()->findOrFail($offer->parcel_id);
            $offer = DispatchOffer::lockForUpdate()->findOrFail($offerId);
            if ($offer->status !== DispatchOffer::STATUS_OFFERED) {
                abort(409, 'This offer is no longer open.');
            }
            $this->close($offer, $offer->expires_at->lte(now()) ? DispatchOffer::STATUS_EXPIRED : DispatchOffer::STATUS_DECLINED, $parcel);
        });
    }

    /** Offers past their 60 seconds expire and the job moves on. Run by the scheduler and before each read. */
    public function expireDue(): int
    {
        $due = DispatchOffer::where('status', DispatchOffer::STATUS_OFFERED)->where('expires_at', '<=', now())->pluck('id');
        foreach ($due as $id) {
            DB::transaction(function () use ($id) {
                $offer = DispatchOffer::find($id);
                if (! $offer) {
                    return;
                }
                $parcel = Parcel::lockForUpdate()->find($offer->parcel_id);
                $offer = DispatchOffer::lockForUpdate()->find($id);
                if ($parcel && $offer && $offer->status === DispatchOffer::STATUS_OFFERED) {
                    $this->close($offer, DispatchOffer::STATUS_EXPIRED, $parcel);
                }
            });
        }

        return $due->count();
    }

    /** A declined or expired offer counts as one try; the job goes to the next rider or to the Unassigned queue. */
    private function close(DispatchOffer $offer, string $status, Parcel $parcel): void
    {
        $offer->update(['status' => $status, 'responded_at' => now()]);
        $parcel->forceFill(['dispatch_attempts' => $parcel->dispatch_attempts + 1])->save();
        $this->offerNext($parcel);
    }

    /** Open offers for a rider, with the seconds left. */
    public function openOffers(Rider $rider): Collection
    {
        $this->expireDue();

        return DispatchOffer::with('parcel.order')->where('rider_id', $rider->id)->where('status', DispatchOffer::STATUS_OFFERED)
            ->where('expires_at', '>', now())->orderBy('expires_at')->get();
    }

    // ── The company assigns by hand ──────────────────────────────────────────

    /**
     * Assign or reassign one parcel (L4). A parcel already picked up cannot change riders; one that is not ready yet
     * cannot be assigned.
     */
    public function assign(LogisticsCompany $company, int $parcelId, Rider $rider, User $by): Parcel
    {
        return DB::transaction(function () use ($company, $parcelId, $rider, $by) {
            $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->lockForUpdate()->find($parcelId);
            abort_unless($parcel, 404, 'Parcel not found in your network.');
            if ($problem = $this->parcelProblem($parcel)) {
                abort(409, $problem);
            }
            if ($parcel->pickup_rider_id === $rider->id) {
                abort(409, 'This rider already has this job.');
            }
            if ($problem = $this->riderProblem($rider, $parcel)) {
                abort(422, $problem);
            }

            $previous = $parcel->pickup_rider_id ? Rider::with('user')->find($parcel->pickup_rider_id) : null;
            DispatchOffer::where('parcel_id', $parcel->id)->where('status', DispatchOffer::STATUS_OFFERED)
                ->update(['status' => DispatchOffer::STATUS_CANCELLED, 'responded_at' => now()]);
            $this->give($parcel, $rider, $by, $previous ? 'Reassigned by the courier company' : 'Assigned by the courier company', $previous);

            AuditLog::record($by, $previous ? 'dispatch.reassigned' : 'dispatch.assigned', $parcel,
                $previous ? ['rider_id' => $previous->id, 'rider' => self::name($previous)] : null,
                ['rider_id' => $rider->id, 'rider' => self::name($rider), 'tracking_number' => $parcel->tracking_number],
                null, $company->id, 'logistics');

            return $parcel->fresh();
        });
    }

    /**
     * Assign several parcels to one rider (L4): as many as the rider can hold; the rest are reported as skipped and
     * stay where they were.
     *
     * @param  array<int>  $parcelIds
     * @return array{assigned: list<string>, skipped: list<array{tracking_number: string|null, parcel_id: int, reason: string}>}
     */
    public function bulkAssign(LogisticsCompany $company, array $parcelIds, Rider $rider, User $by): array
    {
        $assigned = [];
        $skipped = [];
        foreach (array_values(array_unique($parcelIds)) as $id) {
            $tracking = LogisticsCompany::constrain(Parcel::query(), $company->id)->whereKey($id)->value('tracking_number');
            try {
                $assigned[] = $this->assign($company, (int) $id, $rider->fresh(), $by)->tracking_number;
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $skipped[] = ['parcel_id' => (int) $id, 'tracking_number' => $tracking, 'reason' => $e->getMessage()];
            }
        }

        return ['assigned' => $assigned, 'skipped' => $skipped];
    }

    /** Why this parcel cannot be (re)assigned for pickup, or null. */
    public function parcelProblem(Parcel $parcel): ?string
    {
        return match (true) {
            $parcel->picked_up_at !== null || in_array($parcel->status, [Parcel::STATUS_PICKED_UP, Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED,
                Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY, Parcel::STATUS_DELIVERED], true)
                => 'This parcel has already been picked up, so its pickup rider can no longer change.',
            $parcel->status !== Parcel::STATUS_READY_FOR_PICKUP => 'This parcel is not ready for pickup.',
            default => null,
        };
    }

    /** Hands the pickup job to the rider, tells both riders and writes it on the order's timeline. */
    private function give(Parcel $parcel, Rider $rider, ?User $by, string $how, ?Rider $previous = null): void
    {
        $parcel->forceFill([
            'pickup_rider_id' => $rider->id, 'pickup_accepted_at' => now(),
            'sorting_center_id' => $parcel->sorting_center_id ?? $rider->sorting_center_id,
            'dispatch_state' => Parcel::DISPATCH_ASSIGNED,
        ])->save();

        $rider->loadMissing('user');
        if ($parcel->order) {
            $this->machine->recordEvent($parcel->order, $previous ? 'pickup_reassigned' : 'pickup_assigned', $by ? 'logistics' : 'rider',
                $by?->id ?? $rider->user_id, ($previous ? 'Pickup courier changed to ' : 'Pickup courier assigned: ') . self::name($rider) . '.',
                ['rider_id' => $rider->id, 'previous_rider_id' => $previous?->id, 'how' => $how, 'tracking_number' => $parcel->tracking_number]);
        }
        $notifier = app(Notifier::class);
        $notifier->jobAssigned($rider, $parcel, 'pickup');
        if ($previous) {
            $notifier->jobRemoved($previous, $parcel, 'The courier company gave this pickup to another rider.');
        }
    }

    private function company(Parcel $parcel): ?LogisticsCompany
    {
        $id = LogisticsCompany::effectiveId($parcel->logistics_company_id);

        return $id ? LogisticsCompany::find($id) : null;
    }

    public static function name(?Rider $rider): string
    {
        $u = $rider?->user;

        return $u ? trim($u->first_name . ' ' . mb_substr((string) $u->last_name, 0, 1) . '.') : 'a rider';
    }
}
