<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AdminActivityLog;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PayoutRequest;
use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    // ── Dashboard stats ──────────────────────────────────────────────────────

    public function stats(): JsonResponse
    {
        $now            = now();
        $todayStart     = $now->copy()->startOfDay();
        $yesterdayStart = $now->copy()->subDay()->startOfDay();
        $yesterdayEnd   = $now->copy()->subDay()->endOfDay();
        $weekStart      = $now->copy()->startOfWeek();
        $lastWeekStart  = $now->copy()->subWeek()->startOfWeek();
        $lastWeekEnd    = $now->copy()->subWeek()->endOfWeek();
        $monthStart     = $now->copy()->startOfMonth();

        $pendingSellers = SellerProfile::where('application_status', 'pending')->count();

        $userCounts = User::selectRaw("role, count(*) as total")
            ->whereIn('role', ['buyer', 'seller', 'rider'])
            ->groupBy('role')
            ->pluck('total', 'role');

        // New buyers this week vs last week
        $buyersThisWeek = User::where('role', 'buyer')
            ->whereBetween('created_at', [$weekStart, $now])
            ->count();
        $buyersLastWeek = User::where('role', 'buyer')
            ->whereBetween('created_at', [$lastWeekStart, $lastWeekEnd])
            ->count();

        // Pending sellers this week vs last week (for trend)
        $pendingSellersThisWeek = SellerProfile::where('application_status', 'pending')
            ->whereBetween('submitted_at', [$weekStart, $now])
            ->count();
        $pendingSellersLastWeek = SellerProfile::where('application_status', 'pending')
            ->whereBetween('submitted_at', [$lastWeekStart, $lastWeekEnd])
            ->count();

        // Real Orders & GMV
        $ordersToday = Order::whereBetween('created_at', [$todayStart, $now])->count();
        $ordersYesterday = Order::whereBetween('created_at', [$yesterdayStart, $yesterdayEnd])->count();
        $gmvToday = (float) Order::whereBetween('created_at', [$todayStart, $now])
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->sum('total');
        $gmvYesterday = (float) Order::whereBetween('created_at', [$yesterdayStart, $yesterdayEnd])
            ->whereNotIn('status', ['cancelled', 'returned'])
            ->sum('total');

        // Platform Commission Revenue
        $commissionToday = (float) OrderItem::whereHas('order', fn ($q) =>
            $q->whereBetween('created_at', [$todayStart, $now])->whereNotIn('status', ['cancelled'])
        )->sum('commission_amount');

        $commissionThisWeek = (float) OrderItem::whereHas('order', fn ($q) =>
            $q->whereBetween('created_at', [$weekStart, $now])->whereNotIn('status', ['cancelled'])
        )->sum('commission_amount');

        $commissionThisMonth = (float) OrderItem::whereHas('order', fn ($q) =>
            $q->whereBetween('created_at', [$monthStart, $now])->whereNotIn('status', ['cancelled'])
        )->sum('commission_amount');

        $commissionLifetime = (float) OrderItem::whereHas('order', fn ($q) =>
            $q->whereNotIn('status', ['cancelled'])
        )->sum('commission_amount');

        // GCash vs COD Breakdown
        $gcashCount = Order::where('payment_method', 'gcash')->count();
        $codCount   = Order::where('payment_method', 'cod')->count();
        $gcashVol   = (float) Order::where('payment_method', 'gcash')->whereNotIn('status', ['cancelled'])->sum('total');
        $codVol     = (float) Order::where('payment_method', 'cod')->whereNotIn('status', ['cancelled'])->sum('total');

        // Pending counts
        $pendingBuyers         = User::where('buyer_application_status', 'pending')->count();
        $openDisputes          = Dispute::whereIn('status', ['open', 'in_progress'])->count();
        $pendingProducts       = Product::where('status', 'pending_approval')->count();
        $pendingVerifications  = Order::where('payment_method', 'gcash')
            ->where('payment_status', 'pending_verification')
            ->count();
        $pendingPayoutRequests = PayoutRequest::where('status', 'pending')->count();

        return response()->json([
            'data' => [
                'pending_seller_applications'      => $pendingSellers,
                'pending_buyer_applications'       => $pendingBuyers,
                'pending_rider_applications'       => 0,
                'pending_products'                 => $pendingProducts,
                'total_buyers'                     => $userCounts['buyer']  ?? 0,
                'total_sellers'                    => $userCounts['seller'] ?? 0,
                'total_riders'                     => $userCounts['rider']  ?? 0,
                'orders_today'                     => $ordersToday,
                'orders_yesterday'                 => $ordersYesterday,
                'open_disputes'                    => $openDisputes,
                'new_buyers_this_week'             => $buyersThisWeek,
                'new_buyers_last_week'             => $buyersLastWeek,
                'pending_sellers_this_week'        => $pendingSellersThisWeek,
                'pending_sellers_last_week'        => $pendingSellersLastWeek,
                'gmv_today'                        => $gmvToday,
                'gmv_yesterday'                    => $gmvYesterday,
                'commission_today'                 => $commissionToday,
                'commission_this_week'             => $commissionThisWeek,
                'commission_this_month'            => $commissionThisMonth,
                'commission_lifetime'              => $commissionLifetime,
                'gcash_orders_count'               => $gcashCount,
                'cod_orders_count'                 => $codCount,
                'gcash_volume'                     => $gcashVol,
                'cod_volume'                       => $codVol,
                'pending_payment_verifications'    => $pendingVerifications,
                'pending_payout_requests'          => $pendingPayoutRequests,
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
            ->where('status', 'pending_approval')
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
                'link'          => '/admin/product-reviews',
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

        // Daily trend data (GMV, orders, new sellers) — last 14 days
        $chartData = collect(range(13, 0))->map(function ($daysAgo) use ($now) {
            $date = $now->copy()->subDays($daysAgo)->toDateString();
            $newSellers = User::where('role', 'seller')
                ->whereDate('created_at', $date)
                ->count();
            $orders = Order::whereDate('created_at', $date)->count();
            $gmv = (float) Order::whereDate('created_at', $date)
                ->whereNotIn('status', ['cancelled', 'returned'])
                ->sum('total');

            return [
                'date'        => $date,
                'new_sellers' => $newSellers,
                'orders'      => $orders,
                'gmv'         => $gmv,
            ];
        });

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
            ->when($request->role && $request->role !== 'seller', fn ($q) => $q->where('role', $request->role))
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('first_name', 'like', "%{$request->search}%")
                   ->orWhere('last_name',  'like', "%{$request->search}%")
                   ->orWhere('email',      'like', "%{$request->search}%")
                   ->orWhere('phone',      'like', "%{$request->search}%");
            }))
            ->whereIn('role', ['buyer', 'seller', 'rider'])
            ->with('sellerProfile')
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

        return response()->json(['data' => new UserResource($user->fresh())]);
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

        return response()->json(['data' => new UserResource($user->fresh())]);
    }

    // ── Activity log ─────────────────────────────────────────────────────────

    public function activityLog(Request $request): JsonResponse
    {
        $perPage = min(100, max(5, (int) $request->get('per_page', 30)));
        $logs = AdminActivityLog::with('admin')
            ->when($request->action, fn ($q) => $q->where('action', $request->action))
            ->latest('created_at')
            ->paginate($perPage);

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
                    'id'         => $log->admin->id,
                    'first_name' => $log->admin->first_name,
                    'last_name'  => $log->admin->last_name,
                ],
            ]),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page'    => $logs->lastPage(),
                'total'        => $logs->total(),
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
