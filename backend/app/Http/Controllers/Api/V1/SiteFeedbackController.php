<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SiteFeedback;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Feedback about the site: a signed-in user sends it (POST /feedback); the admin lists it and marks it read
 * (GET /admin/feedback, PATCH /admin/feedback/{feedback}).
 */
class SiteFeedbackController extends Controller
{
    /** POST /feedback */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message'  => ['required', 'string', 'min:3', 'max:1000'],
            'page_url' => ['nullable', 'string', 'max:500'],
        ]);

        $feedback = SiteFeedback::create([
            'user_id'  => $request->user()->id,
            'message'  => trim($data['message']),
            'page_url' => $data['page_url'] ?? null,
            'status'   => SiteFeedback::STATUS_NEW,
        ]);

        return response()->json(['message' => 'Thanks for your feedback.', 'data' => ['id' => $feedback->id]], 201);
    }

    /** GET /admin/feedback?status=new|read|all&search=&page=&per_page= */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status'   => ['nullable', 'in:new,read,all'],
            'search'   => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $status = $request->input('status', 'all');
        $like = $request->filled('search') ? '%' . addcslashes((string) $request->search, '\\%_') . '%' : null;

        $page = SiteFeedback::with('user:id,first_name,last_name,email,avatar_path')
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($like, fn ($q) => $q->where(fn ($w) => $w
                ->where('message', 'like', $like)
                ->orWhereHas('user', fn ($u) => $u->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)->orWhere('email', 'like', $like))))
            ->latest()->latest('id')
            ->paginate((int) ($request->per_page ?? 20));

        return response()->json([
            'data' => $page->map(fn (SiteFeedback $f) => $this->format($f)),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $page->total(),
                'per_page'     => $page->perPage(),
                'from'         => $page->firstItem(),
                'to'           => $page->lastItem(),
                'counts'       => [
                    'new'  => SiteFeedback::where('status', SiteFeedback::STATUS_NEW)->count(),
                    'read' => SiteFeedback::where('status', SiteFeedback::STATUS_READ)->count(),
                    'all'  => SiteFeedback::count(),
                ],
            ],
        ]);
    }

    /** PATCH /admin/feedback/{feedback} {status: new|read} */
    public function update(Request $request, SiteFeedback $feedback): JsonResponse
    {
        $status = $request->validate(['status' => ['required', 'in:new,read']])['status'];
        $feedback->update($status === SiteFeedback::STATUS_READ
            ? ['status' => $status, 'read_at' => now(), 'read_by' => $request->user()->id]
            : ['status' => $status, 'read_at' => null, 'read_by' => null]);

        return response()->json(['data' => $this->format($feedback->fresh('user'))]);
    }

    /** @return array<string, mixed> */
    private function format(SiteFeedback $f): array
    {
        return [
            'id'         => $f->id,
            'message'    => $f->message,
            'page_url'   => $f->page_url,
            'status'     => $f->status,
            'read_at'    => $f->read_at?->toIso8601String(),
            'created_at' => $f->created_at?->toIso8601String(),
            'user'       => $f->user ? [
                'id'         => $f->user->id,
                'name'       => trim($f->user->first_name . ' ' . $f->user->last_name),
                'email'      => $f->user->email,
                'avatar_url' => $f->user->avatar_url,
            ] : null,
        ];
    }
}
