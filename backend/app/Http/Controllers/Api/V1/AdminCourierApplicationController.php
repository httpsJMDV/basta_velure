<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LogisticsCompanyResource;
use App\Models\AdminActivityLog;
use App\Models\LogisticsCompany;
use App\Models\SortingCenter;
use App\Services\MailNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** The admin's review of courier companies: list, inspect, approve, reject, suspend and reactivate. */
class AdminCourierApplicationController extends Controller
{
    /** GET /admin/courier-applications?status=PENDING|APPROVED|REJECTED|SUSPENDED|all&search= */
    public function index(Request $request): JsonResponse
    {
        $status = strtoupper((string) $request->query('status', LogisticsCompany::STATUS_PENDING));
        $search = trim((string) $request->query('search', ''));

        $companies = LogisticsCompany::with('owner')
            ->withCount(['hubs', 'hubs as approved_hubs_count' => fn ($q) => $q->where('status', SortingCenter::STATUS_APPROVED)])
            ->when($status !== 'ALL', fn ($q) => $q->where('status', $status))
            // An applicant who has not confirmed their email yet is not in the review queue.
            ->where(fn ($q) => $q->whereNull('owner_user_id')->orWhereHas('owner', fn ($o) => $o->where('status', '!=', 'unverified')))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$search}%")
                ->orWhere('code', 'like', "%{$search}%")
                ->orWhere('contact_email', 'like', "%{$search}%")
                ->orWhereHas('owner', fn ($o) => $o->where('first_name', 'like', "%{$search}%")->orWhere('last_name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            ->orderBy($request->query('sort') === 'oldest' ? 'submitted_at' : 'id', $request->query('sort') === 'oldest' ? 'asc' : 'desc')
            ->paginate(min(100, max(1, (int) $request->query('per_page', 30))));

        $counts = LogisticsCompany::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return response()->json([
            'data' => $companies->getCollection()->map(fn ($c) => (new LogisticsCompanyResource($c))->full()->resolve())->all(),
            'meta' => [
                'current_page' => $companies->currentPage(), 'last_page' => $companies->lastPage(), 'per_page' => $companies->perPage(),
                'total' => $companies->total(), 'from' => $companies->firstItem(), 'to' => $companies->lastItem(),
            ],
            'counts' => [
                'pending'   => (int) ($counts[LogisticsCompany::STATUS_PENDING] ?? 0),
                'approved'  => (int) ($counts[LogisticsCompany::STATUS_APPROVED] ?? 0),
                'rejected'  => (int) ($counts[LogisticsCompany::STATUS_REJECTED] ?? 0),
                'suspended' => (int) ($counts[LogisticsCompany::STATUS_SUSPENDED] ?? 0),
            ],
        ]);
    }

    public function show(LogisticsCompany $company): JsonResponse
    {
        $company->load('owner')->loadCount(['hubs', 'hubs as approved_hubs_count' => fn ($q) => $q->where('status', SortingCenter::STATUS_APPROVED)]);

        return response()->json(['data' => (new LogisticsCompanyResource($company))->full()]);
    }

    public function approve(Request $request, LogisticsCompany $company, MailNotifier $notifier): JsonResponse
    {
        abort_if($company->status !== LogisticsCompany::STATUS_PENDING, 422, 'Only a pending courier application can be approved.');

        $this->decide($request, $company, LogisticsCompany::STATUS_APPROVED, null, 'approve_courier', "Approved courier company \"{$company->name}\".");
        $notifier->courierApplicationDecided($company->fresh('owner'), true);

        return response()->json(['message' => 'Courier company approved.', 'data' => (new LogisticsCompanyResource($company->fresh('owner')))->full()]);
    }

    public function reject(Request $request, LogisticsCompany $company, MailNotifier $notifier): JsonResponse
    {
        abort_if($company->status !== LogisticsCompany::STATUS_PENDING, 422, 'Only a pending courier application can be rejected.');
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        $this->decide($request, $company, LogisticsCompany::STATUS_REJECTED, $reason, 'reject_courier', "Rejected courier company \"{$company->name}\".");
        $notifier->courierApplicationDecided($company->fresh('owner'), false, $reason);

        return response()->json(['message' => 'Courier company rejected.', 'data' => (new LogisticsCompanyResource($company->fresh('owner')))->full()]);
    }

    public function suspend(Request $request, LogisticsCompany $company): JsonResponse
    {
        abort_if($company->status !== LogisticsCompany::STATUS_APPROVED, 422, 'Only an approved courier company can be suspended.');
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        $this->decide($request, $company, LogisticsCompany::STATUS_SUSPENDED, $reason, 'suspend_courier', "Suspended courier company \"{$company->name}\".");

        return response()->json(['message' => 'Courier company suspended.', 'data' => (new LogisticsCompanyResource($company->fresh('owner')))->full()]);
    }

    public function reactivate(Request $request, LogisticsCompany $company): JsonResponse
    {
        abort_if($company->status !== LogisticsCompany::STATUS_SUSPENDED, 422, 'Only a suspended courier company can be reactivated.');

        $this->decide($request, $company, LogisticsCompany::STATUS_APPROVED, null, 'reactivate_courier', "Reactivated courier company \"{$company->name}\".");

        return response()->json(['message' => 'Courier company reactivated.', 'data' => (new LogisticsCompanyResource($company->fresh('owner')))->full()]);
    }

    /** The business permit, from private storage, for the admin only. */
    public function permit(LogisticsCompany $company): BinaryFileResponse
    {
        abort_unless($company->business_permit_path && Storage::disk('ids')->exists($company->business_permit_path), 404, 'Business permit not found.');

        return response()->file(Storage::disk('ids')->path($company->business_permit_path));
    }

    /** GET /admin/courier-applications/{company}/documents/{sec|bir|rep-id} */
    public function document(LogisticsCompany $company, string $doc): BinaryFileResponse
    {
        $path = match ($doc) {
            'sec'    => $company->sec_certificate_path,
            'bir'    => $company->bir_2303_path,
            'rep-id' => $company->representative_id_path,
            default  => null,
        };
        abort_unless($path && Storage::disk('ids')->exists($path), 404, 'Document not found.');

        return response()->file(Storage::disk('ids')->path($path));
    }

    private function decide(Request $request, LogisticsCompany $company, string $status, ?string $reason, string $action, string $description): void
    {
        DB::transaction(function () use ($request, $company, $status, $reason, $action, $description) {
            $company->update(['status' => $status, 'rejection_reason' => $reason, 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
            AdminActivityLog::create([
                'admin_id'    => $request->user()->id,
                'action'      => $action,
                'target_type' => 'logistics_company',
                'target_id'   => $company->id,
                'description' => $description,
                'meta'        => array_filter(['company' => $company->name, 'code' => $company->code, 'reason' => $reason]),
            ]);
        });
    }
}
