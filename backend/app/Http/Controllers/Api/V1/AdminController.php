<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AdminActivityLog;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PayoutRequest;
use App\Models\Product;
use App\Models\Rider;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\AdminAnalyticsService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    public function __construct(private AdminAnalyticsService $analytics)
    {
    }

    // ── Dashboard stats ──────────────────────────────────────────────────────

    /**
     * The dashboard figures. Every sales figure comes from AdminAnalyticsService, the same service behind the
     * Analytics & Reports page, so the two agree for the same range (definitions: docs/api/admin-reports.md).
     *
     * The original keys are all kept. `*_today`, `*_yesterday`, `*_this_week`, `*_this_month` and `*_lifetime` are
     * Asia/Manila calendar periods (weeks start on Monday). The payment split keys now cover the dashboard window, and
     * `window`, `metrics`, `previous`, `pipeline`, `payment_split` and `disputes` are new: the last
     * AdminAnalyticsService::DASHBOARD_DAYS days, the window every dashboard card and chart uses.
     */
    public function stats(): JsonResponse
    {
        $a = $this->analytics;
        $tz = AdminAnalyticsService::TIMEZONE;

        $today = $a->range($a->today(), $a->today());
        $yesterday = $a->previousRange($today);
        $weekStart = CarbonImmutable::now($tz)->startOfWeek(Carbon::MONDAY);
        $thisWeek = $a->range($weekStart->toDateString(), $a->today());
        $lastWeek = $a->range($weekStart->subDays(7)->toDateString(), $weekStart->subDay()->toDateString());
        $thisMonth = $a->range(CarbonImmutable::now($tz)->startOfMonth()->toDateString(), $a->today());

        $window = $a->dashboardRange();
        $overview = $a->overview($window);
        $accounts = $a->registeredAccounts();

        $todaySummary = $a->summary($today);
        $yesterdaySummary = $a->summary($yesterday);

        $pendingSellers = SellerProfile::where('application_status', 'pending')->count();
        $newBuyers = fn (array $range) => User::where('role', 'buyer')->where('created_at', '>=', $range['start'])->where('created_at', '<', $range['end'])->count();
        $pendingSellersIn = fn (array $range) => SellerProfile::where('application_status', 'pending')->where('submitted_at', '>=', $range['start'])->where('submitted_at', '<', $range['end'])->count();

        // Pending counts
        $pendingBuyers         = User::where('buyer_application_status', 'pending')->count();
        $openDisputes          = Dispute::whereIn('status', ['open', 'in_progress'])->count();
        $pendingProducts       = Product::where('status', 'pending_review')->count();
        $pendingVerifications  = Order::where('payment_method', 'gcash')
            ->where('payment_status', 'pending_verification')
            ->count();
        $pendingPayoutRequests = PayoutRequest::where('status', 'pending')->count();

        return response()->json([
            'data' => [
                'pending_seller_applications'      => $pendingSellers,
                'pending_buyer_applications'       => $pendingBuyers,
                // Riders are approved by the hub they chose, not by the admin: this is how many are waiting on a hub.
                'pending_rider_applications'       => Rider::where('status', Rider::STATUS_PENDING)->count(),
                'pending_products'                 => $pendingProducts,
                'total_buyers'                     => $accounts['buyers'],
                'total_sellers'                    => $accounts['sellers'],
                'total_riders'                     => $accounts['riders'],
                'orders_today'                     => $todaySummary['orders'],
                'orders_yesterday'                 => $yesterdaySummary['orders'],
                'open_disputes'                    => $openDisputes,
                'new_buyers_this_week'             => $newBuyers($thisWeek),
                'new_buyers_last_week'             => $newBuyers($lastWeek),
                'pending_sellers_this_week'        => $pendingSellersIn($thisWeek),
                'pending_sellers_last_week'        => $pendingSellersIn($lastWeek),
                'gmv_today'                        => $todaySummary['gmv'],
                'gmv_yesterday'                    => $yesterdaySummary['gmv'],
                'commission_today'                 => $todaySummary['commission'],
                'commission_this_week'             => $a->summary($thisWeek)['commission'],
                'commission_this_month'            => $a->summary($thisMonth)['commission'],
                'commission_lifetime'              => $a->summary($a->allTime())['commission'],
                'gcash_orders_count'               => $overview['payments']['gcash']['count'],
                'cod_orders_count'                 => $overview['payments']['cod']['count'],
                'gcash_volume'                     => $overview['payments']['gcash']['volume'],
                'cod_volume'                       => $overview['payments']['cod']['volume'],
                'pending_payment_verifications'    => $pendingVerifications,
                'pending_payout_requests'          => $pendingPayoutRequests,

                // The dashboard window (the last 30 Manila days), from the same service as the reports page.
                'window'                           => $overview['range'],
                'metrics'                          => $overview['summary'],
                'previous'                         => $overview['previous'],
                'pipeline'                         => $overview['pipeline'],
                'payment_split'                    => $overview['payments'],
                'disputes'                         => $overview['disputes'],
            ],
        ]);
    }

    // ── Dashboard feed (attention items + recent activity) ────────────────────

    public function dashboardFeed(): JsonResponse
    {
        $now = now();
        $threshold = $now->copy()->subHours(48);

        // 1. Pending seller applications
        $pendingSellerApps = SellerProfile::with('user')
            ->where('application_status', 'pending')
            ->orderBy('submitted_at')
            ->take(6)
            ->get()
            ->map(fn ($sp) => [
                'type'          => 'seller_application',
                'id'            => $sp->id,
                'label'         => $sp->shop_name ?? ($sp->user?->first_name . "'s Shop"),
                'sub'           => 'Seller Store Application',
                'waiting_since' => $sp->submitted_at ?? $sp->created_at,
                'urgent'        => $sp->submitted_at ? $sp->submitted_at->lt($threshold) : false,
                'link'          => '/admin/seller-applications',
                'avatar_url'    => $sp->logo_url ?? $sp->user?->avatar_url ?? null,
            ]);

        // 2. Pending buyer verifications
        $pendingBuyerApps = User::where('buyer_application_status', 'pending')
            ->latest('updated_at')
            ->take(6)
            ->get()
            ->map(fn ($u) => [
                'type'          => 'buyer_application',
                'id'            => $u->id,
                'label'         => trim($u->first_name . ' ' . $u->last_name),
                'sub'           => 'Buyer ID Verification',
                'waiting_since' => $u->updated_at ?? $u->created_at,
                'urgent'        => ($u->updated_at ?? $u->created_at)->lt($threshold),
                'link'          => '/admin/buyer-applications',
                'avatar_url'    => $u->avatar_url ?? null,
            ]);

        // 3. Pending products
        $pendingProducts = Product::with('seller')
            ->where('status', 'pending_review')
            ->latest('created_at')
            ->take(6)
            ->get()
            ->map(fn ($p) => [
                'type'          => 'product_approval',
                'id'            => $p->id,
                'label'         => $p->name,
                'sub'           => 'Product Listing Approval',
                'waiting_since' => $p->created_at,
                'urgent'        => $p->created_at->lt($threshold),
                'link'          => '/admin/products',
                'avatar_url'    => $p->primary_image_url ?? ($p->images[0] ?? null),
            ]);

        // 4. Open Disputes
        $openDisputes = Dispute::with(['buyer', 'order'])
            ->whereIn('status', ['open', 'in_progress'])
            ->latest('created_at')
            ->take(6)
            ->get()
            ->map(fn ($d) => [
                'type'          => 'dispute',
                'id'            => $d->id,
                'label'         => "Dispute on #{$d->order?->order_number}",
                'sub'           => $d->reason ?? 'Order Return / Refund Dispute',
                'waiting_since' => $d->created_at,
                'urgent'        => $d->created_at->lt($threshold),
                'link'          => '/admin/disputes',
                'avatar_url'    => $d->buyer?->avatar_url ?? null,
            ]);

        $attentionItems = $pendingSellerApps
            ->concat($pendingBuyerApps)
            ->concat($pendingProducts)
            ->concat($openDisputes)
            ->sortByDesc('urgent')
            ->values()
            ->take(12);

        // Recent activity — last 8 entries
        $activity = AdminActivityLog::with('admin')
            ->latest('created_at')
            ->take(8)
            ->get()
            ->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'description' => $log->description,
                'created_at'  => $log->created_at,
                'admin'       => [
                    'first_name' => $log->admin?->first_name ?? 'System',
                    'last_name'  => $log->admin?->last_name ?? 'Admin',
                ],
            ]);

        // Daily trend over the dashboard window (the last 30 Manila days): the same series the reports page draws.
        // `orders` counts the orders that count toward GMV (not cancelled or returned); `orders_placed` counts every one.
        $window = $this->analytics->dashboardRange();
        $offset = (int) CarbonImmutable::now(AdminAnalyticsService::TIMEZONE)->getOffset();
        $newSellers = DB::table('seller_profiles')
            ->whereRaw('COALESCE(submitted_at, created_at) >= ?', [$window['start']])
            ->whereRaw('COALESCE(submitted_at, created_at) < ?', [$window['end']])
            ->selectRaw("DATE(DATE_ADD(COALESCE(submitted_at, created_at), INTERVAL {$offset} SECOND)) as day, COUNT(*) as total")
            ->groupBy('day')
            ->pluck('total', 'day');
        $chartData = collect($this->analytics->daily($window))->map(fn (array $p) => [
            'date'          => $p['date'],
            'new_sellers'   => (int) ($newSellers[$p['date']] ?? 0),
            'orders'        => $p['orders'],
            'orders_placed' => $p['orders_placed'],
            'gmv'           => $p['gmv'],
            'commission'    => $p['commission'],
        ]);

        return response()->json([
            'data' => [
                'attention_items' => $attentionItems,
                'recent_activity' => $activity,
                'chart_data'      => $chartData,
            ],
        ]);
    }

    // ── Users list (buyers / sellers / riders) ────────────────────────────────

    public function users(Request $request): JsonResponse
    {
        $query = User::query()
            ->when($request->role === 'seller', fn ($q) => $q
                ->whereHas('sellerProfile', fn ($sp) => $sp->where('application_status', 'approved'))
            )
            ->when($request->role && ! in_array($request->role, ['seller', 'rider'], true), fn ($q) => $q->where('role', $request->role))
            // A courier is a buyer with a riders row (older courier accounts carry role "rider").
            ->when($request->role === 'rider', fn ($q) => $q->where(fn ($r) => $r->where('role', 'rider')->orWhereHas('rider')))
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('first_name', 'like', "%{$request->search}%")
                   ->orWhere('last_name',  'like', "%{$request->search}%")
                   ->orWhere('email',      'like', "%{$request->search}%")
                   ->orWhere('phone',      'like', "%{$request->search}%");
            }))
            ->whereIn('role', ['buyer', 'seller', 'rider'])
            ->with('sellerProfile')
            // The Riders page shows each rider's hub and application status (the hub, not the admin, approves riders).
            ->when($request->role === 'rider', fn ($q) => $q->with('rider.sortingCenter'))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 30), 100);
        $users = $query->paginate($perPage);

        return response()->json(UserResource::collection($users)->response()->getData(true));
    }

    // ── Suspend / reactivate ──────────────────────────────────────────────────

    public function suspend(Request $request, User $user): JsonResponse
    {
        abort_if($user->role === 'admin', 403, 'Cannot suspend the admin account.');

        DB::transaction(function () use ($user, $request) {
            $user->tokens()->delete();
            $user->status = 'suspended';
            $user->save();

            AdminActivityLog::create([
                'admin_id'    => $request->user()->id,
                'action'      => 'suspend_user',
                'target_type' => 'user',
                'target_id'   => $user->id,
                'description' => "Suspended {$user->role} account: {$user->email}.",
                'meta'        => ['role' => $user->role, 'email' => $user->email],
            ]);
        });

        app(\App\Services\MailNotifier::class)->accountSuspended($user);

        return response()->json(['data' => new UserResource($user->fresh(['rider.sortingCenter']))]);
    }

    public function reactivate(Request $request, User $user): JsonResponse
    {
        DB::transaction(function () use ($user, $request) {
            $user->status = 'active';
            $user->save();

            AdminActivityLog::create([
                'admin_id'    => $request->user()->id,
                'action'      => 'reactivate_user',
                'target_type' => 'user',
                'target_id'   => $user->id,
                'description' => "Reactivated {$user->role} account: {$user->email}.",
                'meta'        => ['role' => $user->role, 'email' => $user->email],
            ]);
        });

        app(\App\Services\MailNotifier::class)->accountReactivated($user);

        return response()->json(['data' => new UserResource($user->fresh(['rider.sortingCenter']))]);
    }

    // ── Activity log ─────────────────────────────────────────────────────────

    /** The admin actions by area, for the activity log's filters and figures. */
    public const LOG_AREAS = [
        'applications' => ['approve_buyer', 'reject_buyer', 'approve_seller', 'reject_seller', 'approve_courier', 'reject_courier', 'approve_sorting_center', 'reject_sorting_center'],
        'accounts'     => ['suspend_user', 'reactivate_user', 'suspend_courier', 'reactivate_courier', 'suspend_sorting_center', 'reactivate_sorting_center'],
        'catalog'      => ['create_category', 'update_category', 'delete_category'],
        'money'        => ['update_commission', 'update_return_policy', 'confirm_commission'],
        'disputes'     => ['resolve_dispute'],
    ];

    /**
     * GET /admin/activity-log: newest first. Filters: action, area (see LOG_AREAS), admin_id, search (description, action
     * or target), period (today, 7d, 30d). The summary counts the whole log, not the page.
     */
    public function activityLog(Request $request): JsonResponse
    {
        $perPage = min(100, max(5, (int) $request->get('per_page', 30)));
        $today = CarbonImmutable::now('Asia/Manila')->startOfDay()->utc();
        $search = trim((string) $request->query('search', ''));
        $area = (string) $request->query('area', '');
        $since = ['today' => $today, '7d' => $today->subDays(6), '30d' => $today->subDays(29)][(string) $request->query('period', '')] ?? null;

        $logs = AdminActivityLog::with('admin')
            ->when($request->action, fn ($q) => $q->where('action', $request->action))
            ->when(isset(self::LOG_AREAS[$area]), fn ($q) => $q->whereIn('action', self::LOG_AREAS[$area]))
            ->when($area === 'other', fn ($q) => $q->whereNotIn('action', array_merge(...array_values(self::LOG_AREAS))))
            ->when($request->integer('admin_id') > 0, fn ($q) => $q->where('admin_id', $request->integer('admin_id')))
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . addcslashes($search, '%_\\') . '%';
                $q->where(fn ($w) => $w->where('description', 'like', $like)->orWhere('action', 'like', $like)->orWhere('target_type', 'like', $like));
            })
            ->latest('created_at')->orderByDesc('id')
            ->paginate($perPage);

        $byAction = AdminActivityLog::selectRaw('action, COUNT(*) AS n')->groupBy('action')->pluck('n', 'action');
        $areas = [];
        foreach (self::LOG_AREAS as $key => $actions) {
            $areas[$key] = (int) collect($actions)->sum(fn ($a) => $byAction[$a] ?? 0);
        }
        $areas['other'] = (int) $byAction->sum() - array_sum($areas);

        return response()->json([
            'data' => $logs->map(fn ($log) => [
                'id'          => $log->id,
                'action'      => $log->action,
                'target_type' => $log->target_type,
                'target_id'   => $log->target_id,
                'description' => $log->description,
                'meta'        => $log->meta,
                'created_at'  => $log->created_at,
                'admin'       => [
                    'id'         => $log->admin?->id,
                    'first_name' => $log->admin?->first_name,
                    'last_name'  => $log->admin?->last_name,
                ],
            ]),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'per_page'     => $logs->perPage(),
                'total'        => $logs->total(),
                'from'         => $logs->firstItem(),
                'to'           => $logs->lastItem(),
            ],
            'summary' => [
                'total' => (int) $byAction->sum(),
                'today' => AdminActivityLog::where('created_at', '>=', $today)->count(),
                'week'  => AdminActivityLog::where('created_at', '>=', $today->subDays(6))->count(),
                'areas' => $areas,
                // Everyone who has an entry, for the "by admin" filter.
                'admins' => User::whereIn('id', AdminActivityLog::distinct()->pluck('admin_id'))->orderBy('first_name')
                    ->get(['id', 'first_name', 'last_name'])->map(fn ($u) => ['id' => $u->id, 'name' => trim("{$u->first_name} {$u->last_name}")])->values(),
            ],
        ]);
    }

    // ── Search Contacts (Buyers and Sellers for Messaging) ────────────────────

    public function searchContacts(Request $request): JsonResponse
    {
        $q = trim($request->input('query', ''));

        $users = User::with('sellerProfile')
            ->whereIn('role', ['buyer', 'seller'])
            ->when($q, function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('first_name', 'like', "%{$q}%")
                        ->orWhere('last_name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhereHas('sellerProfile', fn ($sp) => $sp->where('shop_name', 'like', "%{$q}%"));
                });
            })
            ->take(30)
            ->get()
            ->map(function ($u) {
                $isSeller = $u->role === 'seller' || $u->sellerProfile !== null;
                return [
                    'id'         => $u->id,
                    'role'       => $isSeller ? 'seller' : 'buyer',
                    'name'       => "{$u->first_name} {$u->last_name}",
                    'email'      => $u->email,
                    'avatar_url' => $isSeller ? ($u->sellerProfile?->logo_url ?? $u->avatar_url) : $u->avatar_url,
                    'shop_name'  => $u->sellerProfile?->shop_name,
                    'shop_logo'  => $u->sellerProfile?->logo_url,
                ];
            });

        return response()->json(['data' => $users]);
    }
}
