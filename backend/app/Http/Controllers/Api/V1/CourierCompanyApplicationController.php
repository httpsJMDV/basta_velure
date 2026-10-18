<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ApplyCourierCompanyRequest;
use App\Http\Resources\LogisticsCompanyResource;
use App\Http\Resources\UserResource;
use App\Models\EmailOtp;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\User;
use App\Services\AccountRegistrar;
use App\Services\EmailOtpService;
use App\Services\MailNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CourierCompanyApplicationController extends Controller
{
    /**
     * A courier company application. A signed-in buyer applies from their account (POST /auth/apply-courier); a
     * visitor creates the contact person's account in the same form (POST /auth/register-courier) and confirms the
     * email with a code before the admin sees it. A rejected application is reopened with the new details.
     */
    public function store(ApplyCourierCompanyRequest $request, MailNotifier $notifier, AccountRegistrar $registrar, EmailOtpService $otp): JsonResponse
    {
        $data = $request->validated();
        $guest = $request->isGuest();
        $stored = [];
        $store = function (string $key, string $dir, string $disk = 'ids') use ($request, &$stored): ?string {
            $file = $request->file($key);
            if (! $file) {
                return null;
            }
            $path = $file->store($dir, $disk);
            $stored[] = [$disk, $path];

            return $path;
        };

        $previous = [];

        try {
            [$user, $company] = DB::transaction(function () use ($request, $data, $guest, $store, $registrar, &$previous) {
                /** @var User $user */
                $user = $guest ? $registrar->createUnverified($data) : $request->user('sanctum');

                $fields = [
                    'name'                   => $data['name'],
                    'code'                   => $data['code'] ?? $this->uniqueCode($data['name'], $request->ownRejectedCompany()?->id),
                    'slug'                   => $this->uniqueSlug($data['name'], $request->ownRejectedCompany()?->id),
                    'owner_user_id'          => $user->id,
                    'description'            => $data['description'] ?? null,
                    'sec_registration_no'    => $data['sec_registration_no'],
                    'tin'                    => $data['tin'],
                    'contact_email'          => $data['contact_email'] ?? $user->email,
                    'contact_phone'          => $data['contact_phone'],
                    'contact_first_name'     => $data['contact_first_name'],
                    'contact_last_name'      => $data['contact_last_name'],
                    'contact_position'       => $data['contact_position'],
                    'service_regions'        => array_values($data['service_regions']),
                    'address_region'         => $data['address_region'],
                    'address_region_code'    => $data['address_region_code'],
                    'address_province'       => $data['address_province'],
                    'address_province_code'  => $data['address_province_code'],
                    'address_city'           => $data['address_city'],
                    'address_city_code'      => $data['address_city_code'],
                    'address_barangay'       => $data['address_barangay'],
                    'address_barangay_code'  => $data['address_barangay_code'],
                    'address_street'         => $data['address_street'],
                    'address_postal_code'    => $data['address_postal_code'],
                    'business_permit_path'   => $store('business_permit', 'courier_permits'),
                    'sec_certificate_path'   => $store('sec_certificate', 'courier_documents'),
                    'bir_2303_path'          => $store('bir_2303', 'courier_documents'),
                    'representative_id_path' => $store('representative_id', 'courier_documents'),
                    'status'                 => LogisticsCompany::STATUS_PENDING,
                    'rejection_reason'       => null,
                    'reviewed_by'            => null,
                    'reviewed_at'            => null,
                    'submitted_at'           => now(),
                ];
                if ($logo = $store('logo', 'courier_logos', 'public')) {
                    $fields['logo_path'] = $logo;
                }

                $rejected = $request->ownRejectedCompany();
                if ($rejected) {
                    $previous = array_filter([
                        ['ids', $rejected->business_permit_path], ['ids', $rejected->sec_certificate_path],
                        ['ids', $rejected->bir_2303_path], ['ids', $rejected->representative_id_path],
                        $logo ? ['public', $rejected->logo_path] : null,
                    ], fn ($p) => $p && $p[1]);
                    $rejected->forceFill($fields)->save();

                    return [$user, $rejected];
                }

                $company = LogisticsCompany::create($fields);
                LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $user->id, 'role' => 'owner']);

                return [$user, $company];
            });
        } catch (\Throwable $e) {
            foreach ($stored as [$disk, $path]) {
                Storage::disk($disk)->delete($path);
            }
            throw $e;
        }

        foreach ($previous as [$disk, $path]) {
            Storage::disk($disk)->delete($path);
        }

        if ($guest) {
            // The admin sees the application once the email is confirmed; the "received" email goes out then.
            $otp->issue($user, EmailOtp::PURPOSE_REGISTER);

            return response()->json([
                'message' => "Application saved. We sent a 6-digit code to {$user->email}. Enter it to verify your email and send the application for review.",
                'verification_required' => true,
                'email' => $user->email,
                'data' => ['company' => (new LogisticsCompanyResource($company))->full()],
            ], 201);
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

    /** A short code from the company's initials ("Bilis Hatid Express Inc." → "BHE"), made unique with a digit. */
    private function uniqueCode(string $name, ?int $ignoreId): string
    {
        $words = array_filter(preg_split('/[^A-Za-z0-9]+/', $name) ?: [], fn ($w) => $w !== '' && ! in_array(strtolower($w), ['inc', 'corp', 'co', 'corporation', 'company', 'ltd', 'the', 'of', 'and'], true));
        $base = strtoupper(substr(implode('', array_map(fn ($w) => $w[0], $words)), 0, 5));
        if (strlen($base) < 2) {
            $base = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name) ?: 'CO', 0, 3));
        }
        $code = $base;
        for ($i = 2; LogisticsCompany::where('code', $code)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists(); $i++) {
            $code = substr($base, 0, 5) . $i;
        }

        return $code;
    }
}
