<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AdminActivityLog;
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
        $now       = now();
        $todayStart     = $now->copy()->startOfDay();
        $yesterdayStart = $now->copy()->subDay()->startOfDay();
        $yesterdayEnd   = $now->copy()->subDay()->endOfDay();
        $weekStart      = $now->copy()->startOfWeek();
        $lastWeekStart  = $now->copy()->subWeek()->startOfWeek();
        $lastWeekEnd    = $now->copy()->subWeek()->endOfWeek();

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

        return response()->json([
            'data' => [
                'pending_seller_applications'      => $pendingSellers,
                'pending_rider_applications'       => 0,
                'total_buyers'                     => $userCounts['buyer']  ?? 0,
                'total_sellers'                    => $userCounts['seller'] ?? 0,
                'total_riders'                     => $userCounts['rider']  ?? 0,
                'orders_today'                     => 0,
                'open_disputes'                    => 0,
                'new_buyers_this_week'             => $buyersThisWeek,
                'new_buyers_last_week'             => $buyersLastWeek,
                'pending_sellers_this_week'        => $pendingSellersThisWeek,
                'pending_sellers_last_week'        => $pendingSellersLastWeek,
                'gmv_today'                        => 0,
                'gmv_yesterday'                    => 0,
                'orders_yesterday'                 => 0,
            ],
        ]);
    }

    // ── Dashboard feed (attention items + recent activity) ────────────────────

    public function dashboardFeed(): JsonResponse
    {
        $now = now();
        $threshold = $now->copy()->subHours(48);

        // Pending seller applications — flag those older than 48h
        $pendingApps = SellerProfile::with('user')
            ->where('application_status', 'pending')
            ->orderBy('submitted_at')
            ->take(10)
            ->get()
            ->map(fn ($sp) => [
                'type'       => 'seller_application',
                'id'         => $sp->id,
                'label'      => $sp->shop_name,
                'sub'        => $sp->user->first_name . ' ' . $sp->user->last_name,
                'waiting_since' => $sp->submitted_at,
                'urgent'     => $sp->submitted_at->lt($threshold),
                'link'       => '/admin/seller-applications',
            ]);

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
                    'first_name' => $log->admin->first_name,
                    'last_name'  => $log->admin->last_name,
                ],
            ]);

        // Seller registrations per day — last 14 days for chart
        $chartData = collect(range(13, 0))->map(function ($daysAgo) use ($now) {
            $date = $now->copy()->subDays($daysAgo)->toDateString();
            $count = User::where('role', 'seller')
                ->whereDate('created_at', $date)
                ->count();
            return ['date' => $date, 'new_sellers' => $count, 'orders' => 0, 'gmv' => 0];
        });

        return response()->json([
            'data' => [
                'attention_items' => $pendingApps,
                'recent_activity' => $activity,
                'chart_data'      => $chartData,
            ],
        ]);
    }

    // ── Users list (buyers / sellers / riders) ────────────────────────────────

    public function users(Request $request): JsonResponse
    {
        $query = User::query()
            ->when($request->role,   fn ($q) => $q->where('role', $request->role))
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->where(function ($q2) use ($request) {
                $q2->where('first_name', 'like', "%{$request->search}%")
                   ->orWhere('last_name',  'like', "%{$request->search}%")
                   ->orWhere('email',      'like', "%{$request->search}%")
                   ->orWhere('phone',      'like', "%{$request->search}%");
            }))
            ->whereIn('role', ['buyer', 'seller', 'rider'])
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
        $logs = AdminActivityLog::with('admin')
            ->when($request->action, fn ($q) => $q->where('action', $request->action))
            ->latest('created_at')
            ->paginate(30);

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
}
