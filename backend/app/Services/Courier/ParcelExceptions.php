<?php

namespace App\Services\Courier;

use App\Enums\OrderStatus;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\User;
use App\Services\Commerce\OrderCanceller;
use App\Services\Commerce\ShippingCalculator;
use App\Services\Notifier;
use App\Services\OrderStateMachine;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * What the courier company does when the normal flow breaks (A35, Logistics L6):
 *
 *  - a manual override moves a parcel to its next step with a reason, for example Delivered when the rider's app was
 *    offline and the delivery was confirmed by phone. Each override is written to the audit log, which cannot be
 *    edited or deleted;
 *  - Lost (with a reason) or Damaged (with a reason and a photo) ends the shipment: the buyer and the seller are
 *    told, the order is cancelled, a prepaid order is refunded in full and a claim for the item value is opened for
 *    the seller.
 */
class ParcelExceptions
{
    /** The steps an override can move a parcel to. Assigning a rider and failing an attempt have their own screens. */
    public const OVERRIDE_TARGETS = [
        OrderStatus::PICKED_UP->value, OrderStatus::AT_SORTING_CENTER->value, OrderStatus::SORTED->value,
        OrderStatus::OUT_FOR_DELIVERY->value, OrderStatus::DELIVERED->value,
    ];

    /** Where a parcel can be when it is lost or damaged: with the courier, after pickup and before delivery. */
    public const IN_TRANSIT = [
        Parcel::STATUS_PICKED_UP, Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED, Parcel::STATUS_ASSIGNED_TO_RIDER,
        Parcel::STATUS_OUT_FOR_DELIVERY, Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURN_TO_SENDER,
    ];

    public function __construct(
        private readonly OrderStateMachine $machine,
        private readonly OrderCanceller $canceller,
    ) {}

    /** The next steps an override can take this parcel to. */
    public function overrideTargets(Parcel $parcel): array
    {
        if (! $parcel->order || $parcel->status === Parcel::STATUS_RETURN_TO_SENDER) {
            return [];
        }

        return array_values(array_intersect(self::OVERRIDE_TARGETS, $this->machine->getAllowedTransitions($parcel->order, 'logistics')));
    }

    public function override(LogisticsCompany $company, int $parcelId, string $to, string $reason, User $by): Parcel
    {
        return DB::transaction(function () use ($company, $parcelId, $to, $reason, $by) {
            $parcel = $this->lock($company, $parcelId);
            $targets = $this->overrideTargets($parcel);
            abort_unless(in_array($to, $targets, true), 422, $targets === []
                ? 'This parcel has no next step to override to.'
                : 'Choose one of the next steps: ' . implode(', ', array_map(fn ($s) => Notifier::statusLabel($s), $targets)) . '.');

            $from = $parcel->status;
            $this->machine->transition($parcel->order, $to, 'logistics', $by->id, "Status corrected by the courier: {$reason}",
                ['override' => true, 'tracking_number' => $parcel->tracking_number, 'reason' => $reason]);

            $now = now();
            $stamp = match ($to) {
                OrderStatus::PICKED_UP->value         => ['picked_up_at' => $now],
                OrderStatus::AT_SORTING_CENTER->value => ['scanned_in_at' => $now],
                OrderStatus::SORTED->value            => ['sorted_at' => $now, 'shipping_zone' => $parcel->shipping_zone ?? $this->zone($parcel)],
                OrderStatus::OUT_FOR_DELIVERY->value  => ['out_for_delivery_at' => $now],
                // Delivered by phone confirmation: the rider collected the COD amount, which is now theirs to remit.
                OrderStatus::DELIVERED->value         => ['delivered_at' => $now] + ($parcel->cod_amount !== null
                    ? ['cod_collected_at' => $now, 'cod_collected_amount' => $parcel->cod_amount] : []),
                default => [],
            };
            Parcel::whereKey($parcel->id)->update($stamp);

            AuditLog::record($by, 'parcel.override', $parcel, ['status' => $from], ['status' => $to, 'tracking_number' => $parcel->tracking_number],
                $reason, $company->id, 'logistics');

            return $parcel->fresh();
        });
    }

    /** Lost or Damaged (A35). A damaged parcel needs a photo. */
    public function markException(LogisticsCompany $company, int $parcelId, string $type, string $reason, ?UploadedFile $photo, User $by): Parcel
    {
        $path = null;
        try {
            return DB::transaction(function () use ($company, $parcelId, $type, $reason, $photo, $by, &$path) {
                $parcel = $this->lock($company, $parcelId);
                abort_unless(in_array($parcel->status, self::IN_TRANSIT, true), 409, match (true) {
                    in_array($parcel->status, [Parcel::STATUS_LOST, Parcel::STATUS_DAMAGED], true) => 'This parcel is already marked ' . strtolower($parcel->status) . '.',
                    $parcel->status === Parcel::STATUS_READY_FOR_PICKUP => 'This parcel has not been picked up yet, so the courier does not hold it.',
                    default => 'This parcel is no longer with the courier.',
                });
                $order = $parcel->order;
                abort_unless($order && $this->machine->canTransition($order, OrderStatus::CANCELLED, 'logistics'), 422, 'This parcel cannot be updated right now.');

                if ($photo) {
                    $path = $photo->store('parcel-exceptions', 'ids');
                }
                $label = $type === 'lost' ? 'lost' : 'damaged';
                $from = $parcel->status;

                $this->machine->transition($order, OrderStatus::CANCELLED, 'logistics', $by->id,
                    "Cancelled: the parcel was {$label} in transit. {$reason}", ['tracking_number' => $parcel->tracking_number, 'exception' => $type]);
                $locked = Order::lockForUpdate()->find($order->id);
                $locked->forceFill(['cancel_reason' => ucfirst($label) . ' in transit', 'cancelled_by' => 'system', 'cancelled_at' => now()])->save();
                $this->canceller->returnVouchers($locked);
                $this->canceller->refund($locked);

                $parcel->forceFill([
                    'status' => $type === 'lost' ? Parcel::STATUS_LOST : Parcel::STATUS_DAMAGED,
                    'exception_type' => $type, 'exception_reason' => $reason, 'exception_photo_path' => $path, 'exception_at' => now(),
                ])->save();

                $claim = round((float) $locked->items()->sum('subtotal'), 2);
                AuditLog::record($by, "parcel.{$label}", $parcel, ['status' => $from],
                    ['status' => $parcel->status, 'tracking_number' => $parcel->tracking_number, 'claim_amount' => $claim, 'photo' => (bool) $path],
                    $reason, $company->id, 'logistics');

                $notifier = app(Notifier::class);
                $notifier->toUserId($locked->buyer_id, "order.parcel_{$label}", "Your parcel was {$label}",
                    "Order {$locked->order_number}: the courier reported the parcel {$label}. The order is cancelled" .
                    ($locked->payment_status === 'refunded' || $locked->refund_status ? ' and your payment is being refunded in full.' : '.'),
                    "/settings/orders?order={$locked->id}", ['order_id' => $locked->id]);
                $notifier->toUserId($parcel->seller_id, "order.parcel_{$label}", "Parcel {$label} by the courier",
                    "Order {$locked->order_number}: the courier reported the parcel {$label}. A claim of ₱" . number_format($claim, 2) .
                    ' for the items is open with the courier.', "/seller/orders?order={$locked->id}", ['order_id' => $locked->id, 'claim_amount' => $claim]);

                return $parcel->fresh();
            });
        } catch (\Throwable $e) {
            if ($path) {
                Storage::disk('ids')->delete($path);
            }
            throw $e;
        }
    }

    private function lock(LogisticsCompany $company, int $parcelId): Parcel
    {
        $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->with('order')->lockForUpdate()->find($parcelId);
        abort_unless($parcel, 404, 'Parcel not found in your network.');

        return $parcel;
    }

    private function zone(Parcel $parcel): ?string
    {
        $snap = $parcel->recipient_snapshot ?? [];
        $companyId = LogisticsCompany::effectiveId($parcel->logistics_company_id);

        return $companyId ? app(ShippingCalculator::class)->zoneName($companyId, ['city' => $snap['city_code'] ?? null, 'province' => $snap['province_code'] ?? null]) : null;
    }
}
