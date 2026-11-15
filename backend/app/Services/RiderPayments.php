<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\RiderPaymentRequest;
use App\Models\TruckTrip;
use App\Models\User;
use App\Support\Gcash;
use App\Support\Money;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** A request reserves exact earnings rows. Hub and courier share one request and one transfer. */
class RiderPayments
{
    public function companyId(Rider $rider): int
    {
        $id = LogisticsCompany::effectiveId($rider->logistics_company_id ?? $rider->sortingCenter?->logistics_company_id);
        abort_unless($id, 422, 'Your courier assignment is missing. Ask your hub to complete your account setup.');

        return $id;
    }

    private function earnings(Rider $rider)
    {
        return RiderEarning::where('rider_id', $rider->id)->whereNull('paid_at')->whereNull('rider_payment_request_id')
            ->whereHas('parcel', fn ($query) => LogisticsCompany::constrain($query, $this->companyId($rider)));
    }

    private function trips(Rider $rider)
    {
        return LogisticsCompany::constrain(TruckTrip::unpaid()->where('driver_id', $rider->id)
            ->whereNull('rider_payment_request_id'), $this->companyId($rider));
    }

    public function summary(Rider $rider): array
    {
        $cents = Money::toCents((string) $this->earnings($rider)->sum('amount'))
            + Money::toCents((string) $this->trips($rider)->sum('pay_amount'));
        $open = RiderPaymentRequest::where('rider_id', $rider->id)->whereIn('status', ['pending', 'processing'])->exists();

        return ['available' => Money::fromCents($cents), 'has_open_request' => $open,
            'gcash_number' => Gcash::format($rider->gcash_number), 'gcash_name' => $rider->gcash_name,
            'hub_name' => $rider->sortingCenter?->hub_name,
            'can_request' => $cents > 0 && ! $open && (bool) $rider->gcash_number && (bool) $rider->gcash_name && (bool) $rider->sorting_center_id];
    }

    public function request(Rider $rider, string $expectedAmount, string $expectedNumber, string $expectedName): RiderPaymentRequest
    {
        return DB::transaction(function () use ($rider, $expectedAmount, $expectedNumber, $expectedName) {
            $rider = Rider::whereKey($rider->id)->lockForUpdate()->firstOrFail();
            abort_unless($rider->sortingCenter, 422, 'Your courier must assign your home hub before you can request payment.');
            abort_unless(LogisticsCompany::effectiveId($rider->sortingCenter->logistics_company_id) === $this->companyId($rider), 422, 'Your hub and courier assignments do not match. Ask your courier to correct your account before requesting payment.');
            abort_unless(Gcash::normalize($rider->gcash_number) && trim((string) $rider->gcash_name), 422, 'Save your GCash number and account name under Account first.');
            abort_unless(Gcash::normalize($expectedNumber) === Gcash::normalize($rider->gcash_number) && trim($expectedName) === trim($rider->gcash_name), 409, 'Your GCash account changed. Refresh and review the account before requesting.');
            abort_if(RiderPaymentRequest::where('rider_id', $rider->id)->whereIn('status', ['pending', 'processing'])->exists(), 409, 'You already have a payment request awaiting processing or confirmation.');
            $earnings = $this->earnings($rider)->lockForUpdate()->get();
            $trips = $this->trips($rider)->lockForUpdate()->get();
            $cents = $earnings->sum(fn ($row) => Money::toCents((string) $row->amount))
                + $trips->sum(fn ($row) => Money::toCents((string) $row->pay_amount));
            abort_unless($cents > 0, 422, 'No unpaid earned balance is available to request. Ongoing trips are eligible after completion.');
            abort_unless($cents === Money::toCents($expectedAmount), 409, 'Your available earnings changed. Refresh and review the new amount before requesting.');
            $payment = RiderPaymentRequest::create(['rider_id' => $rider->id, 'sorting_center_id' => $rider->sorting_center_id,
                'logistics_company_id' => $this->companyId($rider), 'reference_code' => 'RP-'.now('Asia/Manila')->format('Ymd').'-'.Str::upper(Str::random(10)),
                'amount' => Money::fromCents($cents), 'gcash_number' => Gcash::normalize($rider->gcash_number), 'gcash_name' => trim($rider->gcash_name), 'status' => 'pending',
                'breakdown' => ['earnings_count' => $earnings->count(), 'trips_count' => $trips->count(),
                    'earnings_amount' => Money::fromCents($earnings->sum(fn ($row) => Money::toCents((string) $row->amount))),
                    'trips_amount' => Money::fromCents($trips->sum(fn ($row) => Money::toCents((string) $row->pay_amount)))]]);
            RiderEarning::whereIn('id', $earnings->pluck('id'))->update(['rider_payment_request_id' => $payment->id]);
            TruckTrip::whereIn('id', $trips->pluck('id'))->update(['rider_payment_request_id' => $payment->id]);
            AuditLog::record($rider->user, 'rider_payment.requested', $payment, new: ['amount' => $payment->amount, 'rider_id' => $rider->id], companyId: $payment->logistics_company_id, actorRole: 'rider');
            $ids = LogisticsCompanyMember::where('logistics_company_id', $payment->logistics_company_id)->pluck('user_id')->push($rider->sortingCenter->user_id)->filter()->unique();
            foreach (User::whereIn('id', $ids)->get() as $user) {
                app(Notifier::class)->send($user, 'rider_payment.requested', 'Rider payment requested',
                    $payment->reference_code.': PHP '.$payment->amount.' requested. Review the reserved earnings and saved GCash.',
                    $user->sortingCenter ? '/hub/earnings' : '/logistics/money?tab=requests', ['rider_payment_id' => $payment->id]);
            }

            return $payment;
        });
    }

    public function send(RiderPaymentRequest $payment, User $payer, string $reference, UploadedFile $receipt): RiderPaymentRequest
    {
        $path = null;
        try {
            return DB::transaction(function () use ($payment, $payer, $reference, $receipt, &$path) {
                Rider::withTrashed()->whereKey($payment->rider_id)->lockForUpdate()->firstOrFail();
                $p = RiderPaymentRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
                if (in_array($p->status, ['processing', 'completed'], true)) {
                    abort_unless($p->transfer_reference === $reference, 409, 'A different transfer is already recorded. Do not send this payment again.');

                    return $p;
                }
                abort_unless($p->status === 'pending', 409, 'Only pending requests can be paid.');
                abort_unless((int) $p->processed_by === (int) $payer->id, 409, 'Take this request before sending money. Another staff member may already be handling it.');
                $earnings = RiderEarning::where('rider_payment_request_id', $p->id)->lockForUpdate()->get();
                $trips = TruckTrip::where('rider_payment_request_id', $p->id)->lockForUpdate()->get();
                $cents = $earnings->sum(fn ($row) => Money::toCents((string) $row->amount)) + $trips->sum(fn ($row) => Money::toCents((string) $row->pay_amount));
                abort_unless($cents === Money::toCents((string) $p->amount) && ! $earnings->contains(fn ($row) => $row->paid_at !== null) && ! $trips->contains(fn ($row) => $row->paid_at !== null), 409, 'The reserved earnings changed. Contact support before sending money.');
                LogisticsCompany::whereKey($p->logistics_company_id)->lockForUpdate()->firstOrFail();
                abort_if(RiderPaymentRequest::where('logistics_company_id', $p->logistics_company_id)->where('transfer_reference', $reference)->whereKeyNot($p->id)->exists(), 422, 'This transfer reference is already used for another rider payment.');
                abort_if(RiderEarning::where('paid_reference', $reference)->whereHas('parcel', fn ($q) => LogisticsCompany::constrain($q, $p->logistics_company_id))->exists()
                    || LogisticsCompany::constrain(TruckTrip::where('paid_reference', $reference), $p->logistics_company_id)->exists(), 422, 'This transfer reference was already recorded in the courier payment history.');
                $path = $receipt->store('rider-payment-receipts', 'ids');
                abort_unless($path, 503, 'The receipt could not be stored. Try again.');
                $p->update(['status' => 'processing', 'transfer_reference' => $reference, 'receipt_path' => $path, 'processed_by' => $payer->id, 'sent_at' => now()]);
                RiderEarning::where('rider_payment_request_id', $p->id)->update(['paid_at' => now(), 'paid_reference' => $reference]);
                TruckTrip::where('rider_payment_request_id', $p->id)->update(['paid_at' => now(), 'paid_by' => $payer->id, 'paid_reference' => $reference]);
                AuditLog::record($payer, 'rider_payment.sent', $p, new: ['amount' => $p->amount, 'reference' => $reference], companyId: $p->logistics_company_id, actorRole: $payer->sortingCenter ? 'hub' : 'logistics');
                app(Notifier::class)->send($p->rider?->user, 'rider_payment.sent', 'Your payment was sent',
                    'PHP '.$p->amount.' sent to your GCash. Check the receipt and confirm when the money arrives.',
                    $p->rider?->isTruckDriver() ? '/rider/trips' : '/rider/earnings', ['rider_payment_id' => $p->id]);

                return $p;
            });
        } catch (\Throwable $error) {
            if ($path) {
                Storage::disk('ids')->delete($path);
            }
            throw $error;
        }
    }

    public function reject(RiderPaymentRequest $payment, User $payer, string $note): RiderPaymentRequest
    {
        return DB::transaction(function () use ($payment, $payer, $note) {
            Rider::withTrashed()->whereKey($payment->rider_id)->lockForUpdate()->firstOrFail();
            $p = RiderPaymentRequest::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            abort_unless($p->status === 'pending', 409, 'A sent or closed request cannot be rejected.');
            abort_if($p->processed_by !== null && (int) $p->processed_by !== (int) $payer->id, 409, 'Another staff member is handling this request. Ask them to release it before declining.');
            $p->update(['status' => 'rejected', 'note' => $note, 'processed_by' => $payer->id]);
            RiderEarning::where('rider_payment_request_id', $p->id)->update(['rider_payment_request_id' => null]);
            TruckTrip::where('rider_payment_request_id', $p->id)->update(['rider_payment_request_id' => null]);
            AuditLog::record($payer, 'rider_payment.rejected', $p, reason: $note, companyId: $p->logistics_company_id, actorRole: $payer->sortingCenter ? 'hub' : 'logistics');
            app(Notifier::class)->send($p->rider?->user, 'rider_payment.rejected', 'Payment request needs attention',
                $note.' Your unpaid earnings are available to request again.', $p->rider?->isTruckDriver() ? '/rider/trips' : '/rider/earnings', ['rider_payment_id' => $p->id]);

            return $p;
        });
    }
}
