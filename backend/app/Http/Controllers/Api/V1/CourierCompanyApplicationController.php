<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ApplyCourierCompanyRequest;
use App\Http\Resources\LogisticsCompanyResource;
use App\Http\Resources\UserResource;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\User;
use App\Services\MailNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CourierCompanyApplicationController extends Controller
{
    /**
     * The signed-in buyer applies to run a courier company. A rejected application is reopened with the new details.
     *
     * POST /api/v1/auth/apply-courier
     */
    public function store(ApplyCourierCompanyRequest $request, MailNotifier $notifier): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();
        $permit = $request->file('business_permit')->store('courier_permits', 'ids');
        $logo = $request->file('logo')?->store('courier_logos', 'public');
        $previous = [];

        try {
            $company = DB::transaction(function () use ($request, $user, $data, $permit, $logo, &$previous) {
                $fields = [
                    'name'                 => $data['name'],
                    'code'                 => $data['code'],
                    'slug'                 => $this->uniqueSlug($data['name'], $request->ownRejectedCompany()?->id),
                    'owner_user_id'        => $user->id,
                    'description'          => $data['description'] ?? null,
                    'contact_email'        => $data['contact_email'],
                    'contact_phone'        => $data['contact_phone'],
                    'address_province'     => $data['address_province'],
                    'address_city'         => $data['address_city'],
                    'address_barangay'     => $data['address_barangay'],
                    'address_street'       => $data['address_street'],
                    'business_permit_path' => $permit,
                    'status'               => LogisticsCompany::STATUS_PENDING,
                    'rejection_reason'     => null,
                    'reviewed_by'          => null,
                    'reviewed_at'          => null,
                    'submitted_at'         => now(),
                ];
                if ($logo) {
                    $fields['logo_path'] = $logo;
                }

                $rejected = $request->ownRejectedCompany();
                if ($rejected) {
                    $previous = array_filter(['ids' => $rejected->business_permit_path, 'public' => $logo ? $rejected->logo_path : null]);
                    $rejected->forceFill($fields)->save();

                    return $rejected;
                }

                $company = LogisticsCompany::create($fields);
                LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $user->id, 'role' => 'owner']);

                return $company;
            });
        } catch (\Throwable $e) {
            Storage::disk('ids')->delete($permit);
            if ($logo) {
                Storage::disk('public')->delete($logo);
            }
            throw $e;
        }

        foreach ($previous as $disk => $path) {
            Storage::disk($disk)->delete($path);
        }
        $notifier->courierApplicationReceived($company);

        return response()->json([
            'message' => 'Courier company application submitted. Please wait for administrator approval.',
            'data' => [
                'user'    => new UserResource($user->fresh()->load(['sellerProfile', 'sortingCenter', 'rider', 'addresses', 'logisticsMembership.company'])),
                'company' => (new LogisticsCompanyResource($company))->full(),
            ],
        ], 201);
    }

    private function uniqueSlug(string $name, ?int $ignoreId): string
    {
        $base = Str::slug($name) ?: 'courier';
        $slug = $base;
        for ($i = 2; LogisticsCompany::where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
