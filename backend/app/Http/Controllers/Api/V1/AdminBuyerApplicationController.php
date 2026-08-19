<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AdminActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class AdminBuyerApplicationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status', 'pending');
        $search = $request->query('search');
        $sort   = $request->query('sort', 'newest');
        $now    = now();

        $query = User::with('addresses')->where('role', 'buyer')
            ->where('buyer_application_status', $status)
            ->when($search, fn ($q) => $q->where(function ($q2) use ($search) {
                $q2->where('first_name', 'like', "%{$search}%")
                   ->orWhere('last_name',  'like', "%{$search}%")
                   ->orWhere('email',      'like', "%{$search}%")
                   ->orWhere('phone',      'like', "%{$search}%");
            }))
            ->orderBy('created_at', $sort === 'oldest' ? 'asc' : 'desc');

        $perPage = min((int) ($request->per_page ?? 30), 100);
        $users   = $query->paginate($perPage);

        // Summary counts (always for pending regardless of current filter)
        $pendingTotal   = User::where('role', 'buyer')->where('buyer_application_status', 'pending')->count();
        $todayCount     = User::where('role', 'buyer')->where('buyer_application_status', 'pending')
                              ->whereDate('created_at', $now->toDateString())->count();
        $weekCount      = User::where('role', 'buyer')->where('buyer_application_status', 'pending')
                              ->whereBetween('created_at', [$now->copy()->startOfWeek(), $now])->count();

        $paginated = UserResource::collection($users)->response()->getData(true);
        $paginated['summary'] = [
            'pending_total' => $pendingTotal,
            'today'         => $todayCount,
            'this_week'     => $weekCount,
        ];

        return response()->json($paginated);
    }

    public function approve(Request $request, User $user): JsonResponse
    {
        abort_if($user->role !== 'buyer', 422, 'User is not a buyer.');
        abort_if($user->buyer_application_status !== 'pending', 422, 'Application is not pending.');

        DB::transaction(function () use ($user, $request) {
            $user->buyer_application_status = 'approved';
            $user->buyer_rejection_reason   = null;
            $user->save();

            AdminActivityLog::create([
                'admin_id'    => $request->user()->id,
                'action'      => 'approve_buyer',
                'target_type' => 'user',
                'target_id'   => $user->id,
                'description' => "Approved buyer application for {$user->first_name} {$user->last_name} ({$user->email}).",
                'meta'        => ['user_id' => $user->id, 'email' => $user->email],
            ]);
        });

        // Notify applicant
        try {
            Mail::to($user->email)->queue(new \App\Mail\BuyerApplicationMail($user, 'approved'));
        } catch (\Throwable) {}

        return response()->json(['message' => 'Application approved.']);
    }

    public function reject(Request $request, User $user): JsonResponse
    {
        abort_if($user->role !== 'buyer', 422, 'User is not a buyer.');
        abort_if($user->buyer_application_status !== 'pending', 422, 'Application is not pending.');

        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        DB::transaction(function () use ($user, $request) {
            $user->buyer_application_status = 'rejected';
            $user->buyer_rejection_reason   = $request->reason;
            $user->save();

            AdminActivityLog::create([
                'admin_id'    => $request->user()->id,
                'action'      => 'reject_buyer',
                'target_type' => 'user',
                'target_id'   => $user->id,
                'description' => "Rejected buyer application for {$user->first_name} {$user->last_name} ({$user->email}).",
                'meta'        => ['user_id' => $user->id, 'email' => $user->email, 'reason' => $request->reason],
            ]);
        });

        try {
            Mail::to($user->email)->queue(new \App\Mail\BuyerApplicationMail($user, 'rejected', $request->reason));
        } catch (\Throwable) {}

        return response()->json(['message' => 'Application rejected.']);
    }

    /**
     * Serve the buyer's government ID from the private disk — never a direct path.
     */
    public function idImage(User $user): Response
    {
        abort_if(! $user->government_id_image_path, 404);
        abort_unless(Storage::disk('local')->exists($user->government_id_image_path), 404);

        $contents = Storage::disk('local')->get($user->government_id_image_path);
        $mime     = Storage::disk('local')->mimeType($user->government_id_image_path);

        return response($contents, 200)->header('Content-Type', $mime);
    }

    public function idImageBack(User $user): Response
    {
        abort_if(! $user->government_id_image_back_path, 404);
        abort_unless(Storage::disk('local')->exists($user->government_id_image_back_path), 404);

        $contents = Storage::disk('local')->get($user->government_id_image_back_path);
        $mime     = Storage::disk('local')->mimeType($user->government_id_image_back_path);

        return response($contents, 200)->header('Content-Type', $mime);
    }
}
