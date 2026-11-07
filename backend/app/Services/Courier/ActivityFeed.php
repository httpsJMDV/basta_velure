<?php

namespace App\Services\Courier;

use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The activity log of a hub, a courier company or a rider: every step a parcel took (pickups, hub scans, transfers,
 * deliveries, failed attempts, returns, cancellations) and every decision people made (dispatch, rider approvals and
 * suspensions, truck trips, COD, rates). It reads the order timeline (order_status_histories) and the audit log
 * (audit_logs), so it also covers everything that happened before this page existed. Read only: nothing here changes.
 */
class ActivityFeed
{
    public const PAGE_SIZE = 40;

    /** The filter chips, in the order the pages show them. */
    public const CATEGORIES = [
        'pickups'       => 'Pickups',
        'hub'           => 'Hub scans',
        'transfers'     => 'Transfers',
        'deliveries'    => 'Deliveries',
        'failed'        => 'Failed and problems',
        'returns'       => 'Returns',
        'cancellations' => 'Cancellations',
        'team'          => 'Riders and team',
        'money'         => 'Money',
        'settings'      => 'Zones and rates',
    ];

    /** A status change on the order timeline, and what it means for the courier. */
    private const STATUS = [
        'READY_FOR_PICKUP'  => ['pickups', 'Ready for pickup'],
        'PICKED_UP'         => ['pickups', 'Picked up from the shop'],
        'AT_SORTING_CENTER' => ['hub', 'Received at the hub'],
        'SORTED'            => ['hub', 'Sorted'],
        'ASSIGNED_TO_RIDER' => ['hub', 'Given to a delivery rider'],
        'OUT_FOR_DELIVERY'  => ['deliveries', 'Out for delivery'],
        'DELIVERED'         => ['deliveries', 'Delivered'],
        'COMPLETED'         => ['deliveries', 'Buyer confirmed receipt'],
        'DELIVERY_FAILED'   => ['failed', 'Delivery failed'],
        'RETURNED'          => ['returns', 'Returned to the shop'],
        'DISPUTED'          => ['returns', 'Buyer asked to return it'],
        'CANCELLED'         => ['cancellations', 'Order cancelled'],
    ];

    /** A timeline line that changes no status (meta.event). */
    private const EVENTS = [
        'pickup_assigned'          => ['pickups', 'Pickup given to a rider'],
        'pickup_reassigned'        => ['pickups', 'Pickup given to another rider'],
        'hub_departed'             => ['transfers', 'Left for another hub'],
        'hub_arrived'              => ['transfers', 'Arrived from another hub'],
        'rts_assigned'             => ['returns', 'Return rider assigned'],
        'return_pickup_requested'  => ['returns', 'Return pickup booked'],
        'return_pickup_assigned'   => ['returns', 'Return pickup given to a rider'],
        'return_pickup_collected'  => ['returns', 'Returned item collected from the buyer'],
        'return_pickup_failed'     => ['returns', 'Return pickup failed'],
        'return_pickup_at_hub'     => ['returns', 'Returned item received at the hub'],
        'return_pickup_delivered'  => ['returns', 'Returned item back with the shop'],
    ];

    /** Audit actions by prefix (the longest match wins), with their category. */
    private const AUDIT = [
        'dispatch.'              => 'pickups',
        'rts.'                   => 'returns',
        'return_pickup.'         => 'returns',
        'parcel.'                => 'failed',
        'rider.'                 => 'team',
        'truck_trip.departed'    => 'transfers',
        'truck_trip.closed'      => 'transfers',
        'truck_trip.rate_changed' => 'money',
        'truck_driver.'          => 'money',
        'cod.'                   => 'money',
        'shipping.'              => 'settings',
    ];

    private const AUDIT_TITLES = [
        'dispatch.assigned'        => 'Pickup assigned by the courier',
        'dispatch.reassigned'      => 'Pickup reassigned by the courier',
        'rts.assigned'             => 'Return to sender assigned',
        'parcel.override'          => 'Parcel status corrected',
        'parcel.lost'              => 'Parcel marked lost',
        'parcel.damaged'           => 'Parcel marked damaged',
        'rider.added'              => 'Rider added',
        'rider.applied'            => 'Rider applied',
        'rider.reapplied'          => 'Rider applied again',
        'rider.application_approved' => 'Rider application approved',
        'rider.application_rejected' => 'Rider application turned down',
        'rider.approved'           => 'Rider documents approved',
        'rider.rejected'           => 'Rider documents turned down',
        'rider.suspended'          => 'Rider suspended',
        'rider.reactivated'        => 'Rider reactivated',
        'rider.activation_resent'  => 'Activation email sent again',
        'rider.vehicle_changed'    => 'Vehicle changed',
        'rider.license_changed'    => 'License changed',
        'truck_trip.departed'      => 'Truck left with parcels',
        'truck_trip.closed'        => 'Truck trip closed with parcels missing',
        'truck_trip.rate_changed'  => 'Pay per truck trip changed',
        'truck_driver.paid'        => 'Truck driver paid',
        'cod.remittance_confirmed' => 'COD hand-over confirmed',
        'shipping.zone_created'    => 'Delivery zone added',
        'shipping.zone_updated'    => 'Delivery zone changed',
        'shipping.zone_deleted'    => 'Delivery zone removed',
        'shipping.rate_added'      => 'Shipping rate added',
        'shipping.rate_changed'    => 'Shipping rate changed',
        'shipping.rate_removed'    => 'Shipping rate removed',
    ];

    private const ROLE_LABELS = [
        'rider' => 'Rider', 'hub' => 'Hub', 'logistics' => 'Courier', 'seller' => 'Shop', 'buyer' => 'Buyer',
        'admin' => 'Loved-IT', 'system' => 'Automatic',
    ];

    /**
     * Everything that happened to the parcels a hub handled (received, or passing through on a transfer), its riders
     * and its truck trips.
     *
     * @param  array{category?: ?string, search?: ?string, before?: ?string}  $filters
     * @return array{data: list<array<string, mixed>>, next_before: ?string}
     */
    public function forHub(SortingCenter $hub, array $filters): array
    {
        $parcels = Parcel::query()->where('sorting_center_id', $hub->id)
            ->orWhereIn('id', ParcelHubStop::select('parcel_id')->where('sorting_center_id', $hub->id));
        $riderIds = Rider::withTrashed()->where('sorting_center_id', $hub->id)->select('id');
        $tripIds = TruckTrip::where('from_hub_id', $hub->id)->orWhere('to_hub_id', $hub->id)->select('id');

        $timeline = $this->timeline($filters)->whereIn('h.order_id', (clone $parcels)->select('order_id'));
        $audit = $this->audit($filters)->where(fn ($q) => $q
            ->where(fn ($w) => $w->where('a.subject_type', 'Parcel')->whereIn('a.subject_id', (clone $parcels)->select('id')))
            ->orWhere(fn ($w) => $w->where('a.subject_type', 'Rider')->whereIn('a.subject_id', $riderIds))
            ->orWhere(fn ($w) => $w->where('a.subject_type', 'TruckTrip')->whereIn('a.subject_id', $tripIds))
            ->orWhere('a.actor_user_id', $hub->user_id));

        return $this->page($timeline, $audit, $filters);
    }

    /**
     * Everything across a courier company's network.
     *
     * @param  array{category?: ?string, search?: ?string, before?: ?string}  $filters
     * @return array{data: list<array<string, mixed>>, next_before: ?string}
     */
    public function forCompany(LogisticsCompany $company, array $filters): array
    {
        $orders = LogisticsCompany::constrain(Parcel::query(), $company->id)->select('order_id');
        $timeline = $this->timeline($filters)->whereIn('h.order_id', $orders);
        $audit = $this->audit($filters);
        LogisticsCompany::constrain($audit, $company->id, 'a.logistics_company_id');

        return $this->page($timeline, $audit, $filters);
    }

    /**
     * What one rider did (pickups, scans, deliveries, failed attempts, returns), what was decided about their account,
     * and, for a truck driver, their trips.
     *
     * @param  array{category?: ?string, search?: ?string, before?: ?string}  $filters
     * @return array{data: list<array<string, mixed>>, next_before: ?string}
     */
    public function forRider(Rider $rider, array $filters): array
    {
        $timeline = $this->timeline($filters)->where('h.actor_type', 'rider')->where('h.actor_id', $rider->user_id);
        $trips = TruckTrip::where('driver_id', $rider->id)->select('id');
        $audit = $this->audit($filters)->where(fn ($q) => $q
            ->where(fn ($w) => $w->where('a.subject_type', 'Rider')->where('a.subject_id', $rider->id))
            ->orWhere(fn ($w) => $w->where('a.subject_type', 'TruckTrip')->whereIn('a.subject_id', $trips))
            ->orWhere('a.actor_user_id', $rider->user_id));

        return $this->page($timeline, $audit, $filters);
    }

    /** @return list<array{key: string, label: string}> */
    public static function categories(): array
    {
        return array_map(fn ($key, $label) => ['key' => $key, 'label' => $label], array_keys(self::CATEGORIES), self::CATEGORIES);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /** The order timeline lines a courier cares about, with the parcel's tracking number. */
    private function timeline(array $filters): QueryBuilder
    {
        $category = $this->category($filters);
        $statuses = array_keys(array_filter(self::STATUS, fn ($row) => $category === null || $row[0] === $category));
        $events = array_keys(array_filter(self::EVENTS, fn ($row) => $category === null || $row[0] === $category));

        $query = DB::table('order_status_histories as h')
            ->leftJoin('parcels as p', 'p.order_id', '=', 'h.order_id')
            ->leftJoin('orders as o', 'o.id', '=', 'h.order_id')
            ->select('h.id', 'h.order_id', 'h.from_status', 'h.to_status', 'h.actor_type', 'h.actor_id', 'h.note', 'h.meta', 'h.created_at',
                'p.tracking_number', 'o.order_number')
            ->where(function ($q) use ($statuses, $events) {
                // A status change: from differs from to. An event keeps the status and names itself in meta.event.
                $q->where(fn ($w) => $w->whereColumn('h.from_status', '!=', 'h.to_status')->whereIn('h.to_status', $statuses ?: ['-']))
                    ->orWhere(fn ($w) => $w->whereNull('h.from_status')->whereIn('h.to_status', $statuses ?: ['-']))
                    ->orWhereIn(DB::raw("JSON_UNQUOTE(JSON_EXTRACT(h.meta, '$.event'))"), $events ?: ['-']);
            });

        if ($search = $this->search($filters)) {
            $query->where(fn ($w) => $w->where('p.tracking_number', 'like', "%{$search}%")->orWhere('o.order_number', 'like', "%{$search}%"));
        }
        if ($before = $this->before($filters)) {
            $query->where('h.created_at', '<', $before);
        }

        return $query;
    }

    private function audit(array $filters): QueryBuilder
    {
        $category = $this->category($filters);
        $query = DB::table('audit_logs as a')
            ->select('a.id', 'a.actor_user_id', 'a.actor_role', 'a.action', 'a.subject_type', 'a.subject_id', 'a.old_value', 'a.new_value', 'a.reason', 'a.created_at')
            ->where(function ($q) use ($category) {
                foreach (self::AUDIT as $prefix => $cat) {
                    if ($category === null || $cat === $category) {
                        $q->orWhere('a.action', 'like', str_ends_with($prefix, '.') ? $prefix . '%' : $prefix);
                    }
                }
                $q->orWhereRaw('1 = 0');
            });

        if ($search = $this->search($filters)) {
            $query->where(fn ($w) => $w->where('a.new_value', 'like', "%{$search}%")->orWhere('a.old_value', 'like', "%{$search}%")
                ->orWhere('a.reason', 'like', "%{$search}%"));
        }
        if ($before = $this->before($filters)) {
            $query->where('a.created_at', '<', $before);
        }

        return $query;
    }

    /** @return array{data: list<array<string, mixed>>, next_before: ?string} */
    private function page(QueryBuilder $timeline, QueryBuilder|Builder $audit, array $filters): array
    {
        $limit = self::PAGE_SIZE;
        $lines = $timeline->orderByDesc('h.created_at')->orderByDesc('h.id')->limit($limit)->get();
        $audits = ($audit instanceof Builder ? $audit->toBase() : $audit)->orderByDesc('a.created_at')->orderByDesc('a.id')->limit($limit)->get();

        $actors = User::whereIn('id', $lines->pluck('actor_id')->merge($audits->pluck('actor_user_id'))->filter()->unique())
            ->get(['id', 'first_name', 'last_name'])->keyBy('id');
        $parcels = Parcel::whereIn('id', $audits->where('subject_type', 'Parcel')->pluck('subject_id')->filter()->unique())
            ->pluck('tracking_number', 'id');

        $rows = $lines->map(fn ($h) => $this->timelineRow($h, $actors))
            ->merge($audits->map(fn ($a) => $this->auditRow($a, $actors, $parcels)))
            ->sortByDesc(fn ($row) => $row['at'] . sprintf('%012d', (int) substr($row['id'], 2)))
            ->values();

        $page = $rows->take($limit)->values();
        $more = $lines->count() === $limit || $audits->count() === $limit;

        return [
            'data'        => $page->all(),
            'next_before' => $more && $page->isNotEmpty() ? $page->last()['at'] : null,
        ];
    }

    // ── Rows ──────────────────────────────────────────────────────────────────

    /** @param Collection<int, User> $actors */
    private function timelineRow(object $h, Collection $actors): array
    {
        $meta = is_string($h->meta) ? (json_decode($h->meta, true) ?: []) : (array) $h->meta;
        $event = $meta['event'] ?? null;
        [$category, $title] = $event && isset(self::EVENTS[$event]) ? self::EVENTS[$event] : (self::STATUS[$h->to_status] ?? ['other', ucfirst(strtolower(str_replace('_', ' ', $h->to_status)))]);

        return [
            'id'              => 'h-' . $h->id,
            'kind'            => 'timeline',
            'category'        => $category,
            'title'           => $title,
            'detail'          => $h->note,
            'at'              => Carbon::parse($h->created_at)->toIso8601String(),
            'actor'           => $this->actor($h->actor_type, $h->actor_id ? $actors->get($h->actor_id) : null),
            'tracking_number' => $h->tracking_number ?? ($meta['tracking_number'] ?? null),
            'order_number'    => $h->order_number,
        ];
    }

    /**
     * @param Collection<int, User> $actors
     * @param Collection<int, string> $parcels
     */
    private function auditRow(object $a, Collection $actors, Collection $parcels): array
    {
        $new = is_string($a->new_value) ? (json_decode($a->new_value, true) ?: []) : (array) $a->new_value;
        $category = 'other';
        $best = -1;
        foreach (self::AUDIT as $prefix => $cat) {
            if (str_starts_with($a->action, $prefix) && strlen($prefix) > $best) {
                [$category, $best] = [$cat, strlen($prefix)];
            }
        }

        return [
            'id'              => 'a-' . $a->id,
            'kind'            => 'audit',
            'category'        => $category,
            'title'           => self::AUDIT_TITLES[$a->action] ?? ucfirst(str_replace(['.', '_'], ' ', $a->action)),
            'detail'          => $this->auditDetail($a->action, $new, $a->reason),
            'at'              => Carbon::parse($a->created_at)->toIso8601String(),
            'actor'           => $this->actor($a->actor_role, $a->actor_user_id ? $actors->get($a->actor_user_id) : null),
            'tracking_number' => $a->subject_type === 'Parcel' ? ($parcels[$a->subject_id] ?? null) : ($new['tracking_number'] ?? null),
            'order_number'    => null,
        ];
    }

    /** One readable line from what the audit entry stored. */
    private function auditDetail(string $action, array $new, ?string $reason): ?string
    {
        $bits = match (true) {
            $action === 'truck_trip.departed' => [
                ($new['code'] ?? '') . ': ' . ($new['parcels'] ?? '?') . ' parcels from ' . ($new['from'] ?? '?') . ' to ' . ($new['to'] ?? '?'),
                isset($new['driver']) ? 'driver ' . $new['driver'] . (isset($new['plate_number']) ? " ({$new['plate_number']})" : '') : null,
            ],
            $action === 'truck_driver.paid' => [
                '₱' . number_format((float) ($new['amount'] ?? 0), 2) . ' for ' . ($new['trips'] ?? 0) . ' trips',
                ! empty($new['reference']) ? 'reference ' . $new['reference'] : null,
            ],
            $action === 'truck_trip.rate_changed' => ['now ₱' . number_format((float) ($new['rate'] ?? 0), 2) . ' per trip'],
            isset($new['name']) => [$new['name']],
            isset($new['status']) => ['now ' . strtolower(str_replace('_', ' ', (string) $new['status']))],
            default => [],
        };
        $line = implode(' · ', array_filter($bits));

        return trim($line . ($reason ? ($line !== '' ? '. ' : '') . $reason : '')) ?: null;
    }

    private function actor(?string $role, ?User $user): array
    {
        $role = $role ?: 'system';

        return [
            'role'  => self::ROLE_LABELS[$role] ?? ucfirst($role),
            'name'  => $user ? trim($user->first_name . ' ' . $user->last_name) : ($role === 'system' ? 'Automatic' : null),
        ];
    }

    private function category(array $filters): ?string
    {
        $category = $filters['category'] ?? null;

        return is_string($category) && isset(self::CATEGORIES[$category]) ? $category : null;
    }

    private function search(array $filters): ?string
    {
        $search = trim((string) ($filters['search'] ?? ''));

        return $search !== '' ? addcslashes(mb_substr($search, 0, 60), '%_\\') : null;
    }

    private function before(array $filters): ?Carbon
    {
        try {
            return ! empty($filters['before']) ? Carbon::parse((string) $filters['before']) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
