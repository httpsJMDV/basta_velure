<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Riders are added by their courier company (A13): the company creates the rider, who starts as Pending Activation
 * and receives a one-time link, valid for 24 hours, to set their password. Activating makes the rider Active; there
 * is no separate admin or hub approval.
 */
class RiderOnboarding
{
    /**
     * @param  array<string, mixed>  $data  validated AddRiderRequest input
     */
    public function add(LogisticsCompany $company, User $by, array $data, UploadedFile $license, UploadedFile $orCr): Rider
    {
        $licensePath = $license->store('rider_licenses', 'ids');
        $orCrPath = $orCr->store('rider_or_cr', 'ids');

        try {
            $rider = DB::transaction(function () use ($company, $by, $data, $licensePath, $orCrPath) {
                $user = User::create([
                    'first_name'    => $data['first_name'],
                    'middle_name'   => $data['middle_name'] ?? null,
                    'last_name'     => $data['last_name'],
                    'email'         => $data['email'],
                    'phone'         => $data['phone'],
                    'date_of_birth' => $data['date_of_birth'],
                    // No usable password until the rider sets one from the activation link.
                    'password'      => Str::random(48),
                ]);
                $user->forceFill(['role' => 'rider', 'status' => 'pending_activation'])->save();

                $hubId = $data['sorting_center_id'] ?? LogisticsCompany::constrain(SortingCenter::query(), $company->id)
                    ->where('status', SortingCenter::STATUS_APPROVED)->orderBy('id')->value('id');

                $rider = Rider::create([
                    'user_id'              => $user->id,
                    'logistics_company_id' => $company->id,
                    'sorting_center_id'    => $hubId,
                    'vehicle_type'         => $data['vehicle_type'],
                    'plate_number'         => $data['plate_number'],
                    'license_number'       => $data['license_number'],
                    'license_expiry'       => $data['license_expiry'],
                    'drivers_license_path' => $licensePath,
                    'or_cr_path'           => $orCrPath,
                    'status'               => Rider::STATUS_PENDING_ACTIVATION,
                    'submitted_at'         => now(),
                    'reviewed_by'          => $by->id,
                    'reviewed_at'          => now(),
                ]);

                AuditLog::record($by, 'rider.added', $rider, null, [
                    'name' => trim($user->first_name . ' ' . $user->last_name), 'email' => $user->email,
                    'plate_number' => $rider->plate_number, 'license_number' => $rider->license_number,
                ], companyId: $company->id, actorRole: 'logistics');

                return $rider;
            });
        } catch (\Throwable $e) {
            Storage::disk('ids')->delete([$licensePath, $orCrPath]);
            throw $e;
        }

        $this->sendActivation($rider->load('user'), $company);

        return $rider;
    }

    /** Emails a new activation link; any earlier link stops working. */
    public function sendActivation(Rider $rider, ?LogisticsCompany $company = null): void
    {
        if ($rider->status !== Rider::STATUS_PENDING_ACTIVATION) {
            throw ValidationException::withMessages(['rider' => 'This rider has already activated their account.']);
        }

        $token = Str::random(64);
        $hours = (int) config('verification.activation_hours', 24);
        $rider->forceFill([
            'activation_token_hash' => hash('sha256', $token),
            'activation_sent_at'    => now(),
            'activation_expires_at' => now()->addHours($hours),
        ])->save();

        $company ??= LogisticsCompany::find($rider->companyId());
        $link = rtrim(explode(',', (string) (config('app.frontend_url') ?: 'http://localhost:5173'))[0], '/') . '/rider/activate?token=' . $token;

        app(MailNotifier::class)->riderActivation($rider->user, $company?->name ?? 'Your courier company', $link, $hours);
    }

    /**
     * The rider behind an activation link. Throws a 410 for an expired link and a 404 for an unknown or used one.
     */
    public function riderForToken(string $token): Rider
    {
        $rider = $token !== '' ? Rider::with('user')->where('activation_token_hash', hash('sha256', $token))->first() : null;

        if (! $rider || $rider->status !== Rider::STATUS_PENDING_ACTIVATION) {
            abort(404, 'This activation link is invalid or has already been used. If you already set your password, sign in.');
        }
        if (! $rider->activation_expires_at || $rider->activation_expires_at->isPast()) {
            abort(410, 'This activation link has expired. Ask your courier company to send a new one.');
        }

        return $rider;
    }

    public function activate(string $token, string $password): Rider
    {
        return DB::transaction(function () use ($token, $password) {
            $rider = $this->riderForToken($token);
            $rider = Rider::with('user')->lockForUpdate()->findOrFail($rider->id);
            if ($rider->status !== Rider::STATUS_PENDING_ACTIVATION) {
                abort(404, 'This activation link is invalid or has already been used.');
            }

            $rider->user->forceFill([
                'password'          => Hash::make($password),
                'status'            => 'active',
                'email_verified_at' => now(),
            ])->save();

            $rider->forceFill([
                'status'                => Rider::STATUS_ACTIVE,
                'activated_at'          => now(),
                // The link works once.
                'activation_token_hash' => null,
                'activation_expires_at' => null,
            ])->save();

            return $rider;
        });
    }
}
