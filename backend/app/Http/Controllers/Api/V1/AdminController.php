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
        $pendingSellers = SellerProfile::where('application_status', 'pending')->count();

        $userCounts = User::selectRaw("role, count(*) as total")
            ->whereIn('role', ['buyer', 'seller', 'rider'])
            ->groupBy('role')
            ->pluck('total', 'role');

        return response()->json([
            'data' => [
                'pending_seller_applications' => $pendingSellers,
                'pending_rider_applications'  => 0, // rider table not yet built
                'total_buyers'                => $userCounts['buyer']  ?? 0,
                'total_sellers'               => $userCounts['seller'] ?? 0,
                'total_riders'                => $userCounts['rider']  ?? 0,
                'orders_today'                => 0, // orders table not yet built
                'open_disputes'               => 0, // disputes table not yet built
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

        $users = $query->paginate(20);

        return response()->json(UserResource::collection($users)->response()->getData(true));
    }

    // ── Suspend / reactivate ──────────────────────────────────────────────────

    public function suspend(Request $request, User $user): JsonResponse
    {
        abort_if($user->role === 'admin', 403, 'Cannot suspend the admin account.');

        DB::transaction(function () use ($user, $request) {
            $user->update(['status' => 'suspended']);

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
            $user->update(['status' => 'active']);

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
