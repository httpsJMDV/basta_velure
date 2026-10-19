<?php

namespace App\Services;

use App\Models\AdminActivityLog;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\SellerProfile;
use App\Models\User;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The life of one weekly courier ↔ shop payment (see CourierSettlement): the payer records it (with an optional
 * GCash receipt), the other side confirms it or reports that it did not arrive, and a Loved-IT admin settles what is
 * reported or left unconfirmed. Each step tells the other side; a report also tells the admins. Loved-IT never holds
 * this money, so the admin only steps in when something goes wrong.
 */
class SettlementPayments
{
    public const RECEIPT_DISK = 'ids';
    public const RECEIPT_DIR = 'settlement-receipts';

    public function __construct(
        private readonly DirectSettlement $money,
        private readonly Notifier $notifier,
    ) {}

    /**
     * The payer sent the week's net by GCash. A week already paid is refused, unless an admin asked for it to be
     * sent again: then the voided payment moves to the history and this one takes its place.
     *
     * @param array{company_id: int, seller_id: int, orders_count: int, cod_cents: int, fee_cents: int, net_cents: int} $line
     */
    public function record(array $line, CarbonImmutable $from, CarbonImmutable $to, string $reference, ?UploadedFile $receipt, User $by): CourierSettlement
    {
        $settlement = DB::transaction(function () use ($line, $from, $to, $reference, $receipt, $by) {
            $existing = CourierSettlement::where('logistics_company_id', $line['company_id'])->where('seller_id', $line['seller_id'])
                ->whereDate('period_start', $from->toDateString())->lockForUpdate()->first();
            abort_if($existing && $existing->state() !== CourierSettlement::STATE_PAY_AGAIN, 422, 'That week is already settled.');

            $path = $receipt?->store(self::RECEIPT_DIR, self::RECEIPT_DISK);
            if (! $existing) {
                $created = $this->money->recordCourierPayment($line, $from, $to, $reference, $by->id);
                if ($path) {
                    $created->update(['receipt_path' => $path]);
                }

                return $created;
            }

            $existing->update([
                ...$this->clearedAttempt($existing),
                'orders_count'  => $line['orders_count'],
                'cod_collected' => Money::fromCents($line['cod_cents']),
                'courier_fees'  => Money::fromCents($line['fee_cents']),
                'net_amount'    => Money::fromCents($line['net_cents']),
                'reference'     => $reference,
                'receipt_path'  => $path,
                'paid_by'       => $by->id,
                'paid_at'       => now(),
            ]);

            return $existing;
        });

        $again = ! empty($settlement->attempts);
        $this->tell($settlement, $settlement->receiverSide(), 'settlement.paid',
            $again ? 'Payment sent again' : 'Payment sent to you',
            "{$this->name($settlement, $settlement->payerSide())} sent {$this->peso($settlement)} for {$this->week($settlement)} (GCash ref {$settlement->reference})."
            . ' Check your GCash, then confirm it or report that it did not arrive.');

        return $settlement;
    }

    /** The receiving side found the money in its GCash. Also closes a report the receiver made earlier. */
    public function confirm(CourierSettlement $s, User $by): CourierSettlement
    {
        abort_unless(in_array($s->state(), [CourierSettlement::STATE_SENT, CourierSettlement::STATE_DISPUTED], true), 422,
            $s->state() === CourierSettlement::STATE_SETTLED ? 'Already confirmed.' : 'This payment was voided; wait for it to be sent again.');
        $s->update(['confirmed_at' => now(), 'confirmed_by' => $by->id]);

        $this->tell($s, $s->payerSide(), 'settlement.confirmed', 'Payment confirmed',
            "{$this->name($s, $s->receiverSide())} confirmed your {$this->peso($s)} for {$this->week($s)}. The week is settled.");

        return $s->fresh();
    }

    /** The receiving side says the money did not arrive: the payer and Loved-IT's admins are told. */
    public function dispute(CourierSettlement $s, User $by, string $reason): CourierSettlement
    {
        abort_unless($s->state() === CourierSettlement::STATE_SENT, 422, match ($s->state()) {
            CourierSettlement::STATE_DISPUTED => 'You already reported this payment. Loved-IT is looking into it.',
            CourierSettlement::STATE_SETTLED  => 'This payment is already confirmed.',
            default                           => 'This payment was voided; wait for it to be sent again.',
        });
        $s->update(['disputed_at' => now(), 'disputed_by' => $by->id, 'dispute_reason' => $reason]);

        $receiver = $this->name($s, $s->receiverSide());
        $this->tell($s, $s->payerSide(), 'settlement.disputed', 'Payment reported as not received',
            "{$receiver} says your {$this->peso($s)} for {$this->week($s)} (ref {$s->reference}) did not arrive: \"{$reason}\". Loved-IT will review it; attach your GCash receipt if you have it.");
        $this->notifier->toAdmins('settlement.disputed', 'A settlement payment was reported',
            "{$receiver} did not receive {$this->peso($s)} from {$this->name($s, $s->payerSide())} for {$this->week($s)}.",
            '/admin/payments?tab=settlements', ['settlement_id' => $s->id]);

        return $s->fresh();
    }

    /** The payer adds (or replaces) the GCash receipt while the payment is still open. */
    public function attachReceipt(CourierSettlement $s, UploadedFile $receipt): CourierSettlement
    {
        abort_unless(in_array($s->state(), [CourierSettlement::STATE_SENT, CourierSettlement::STATE_DISPUTED], true), 422,
            'The receipt can be changed only while the payment is waiting for confirmation.');
        $old = $s->receipt_path;
        $s->update(['receipt_path' => $receipt->store(self::RECEIPT_DIR, self::RECEIPT_DISK)]);
        if ($old) {
            Storage::disk(self::RECEIPT_DISK)->delete($old);
        }

        $this->tell($s, $s->receiverSide(), 'settlement.receipt', 'GCash receipt attached',
            "{$this->name($s, $s->payerSide())} attached the GCash receipt of {$this->peso($s)} for {$this->week($s)}.");

        return $s->fresh();
    }

    /**
     * An admin settles a reported or unconfirmed payment: "received" (the transfer checks out) closes the week;
     * "pay_again" voids the payment so the payer sends a new one. Both sides are told why.
     */
    public function resolve(CourierSettlement $s, User $admin, string $outcome, string $note): CourierSettlement
    {
        abort_unless(in_array($s->state(), [CourierSettlement::STATE_SENT, CourierSettlement::STATE_DISPUTED], true), 422, 'This payment is already settled or voided.');
        $received = $outcome === CourierSettlement::RESOLUTION_RECEIVED;
        $s->update([
            'resolved_at'     => now(),
            'resolved_by'     => $admin->id,
            'resolution'      => $outcome,
            'resolution_note' => $note,
            ...($received ? ['confirmed_at' => now(), 'confirmed_by' => $admin->id] : ['reopened_at' => now()]),
        ]);

        AdminActivityLog::create([
            'admin_id'    => $admin->id,
            'action'      => 'resolve_settlement',
            'target_type' => 'courier_settlement',
            'target_id'   => $s->id,
            'description' => ($received ? 'Marked as received: ' : 'Asked to pay again: ')
                . "{$this->peso($s)} from {$this->name($s, $s->payerSide())} to {$this->name($s, $s->receiverSide())} for {$this->week($s)}.",
            'meta'        => ['outcome' => $outcome, 'note' => $note, 'reference' => $s->reference, 'company_id' => $s->logistics_company_id, 'seller_id' => $s->seller_id],
        ]);

        $week = $this->week($s);
        if ($received) {
            foreach (['courier', 'seller'] as $side) {
                $this->tell($s, $side, 'settlement.resolved', 'Loved-IT settled a payment',
                    "Loved-IT checked the {$this->peso($s)} payment for {$week} (ref {$s->reference}) and marked it received. Note: {$note}");
            }
        } else {
            $this->tell($s, $s->payerSide(), 'settlement.pay_again', 'Send the payment again',
                "Loved-IT could not confirm your {$this->peso($s)} for {$week} (ref {$s->reference}), so it was voided. Send it again and record the new reference. Note: {$note}");
            $this->tell($s, $s->receiverSide(), 'settlement.pay_again', 'Payment voided',
                "Loved-IT voided the {$this->peso($s)} payment for {$week} (ref {$s->reference}) and asked {$this->name($s, $s->payerSide())} to send it again. Note: {$note}");
        }

        return $s->fresh();
    }

    /** An admin nudges the receiving side of an overdue payment to confirm or report it (at most once a day). */
    public function remind(CourierSettlement $s, User $admin): CourierSettlement
    {
        abort_unless($s->state() === CourierSettlement::STATE_SENT, 422, 'Only a payment waiting for confirmation can be reminded.');
        abort_if($s->reminded_at && $s->reminded_at->gt(now()->subDay()), 422, 'A reminder was already sent today.');
        $s->update(['reminded_at' => now()]);

        AdminActivityLog::create([
            'admin_id'    => $admin->id,
            'action'      => 'remind_settlement',
            'target_type' => 'courier_settlement',
            'target_id'   => $s->id,
            'description' => "Reminded {$this->name($s, $s->receiverSide())} to confirm {$this->peso($s)} for {$this->week($s)}.",
            'meta'        => ['reference' => $s->reference, 'company_id' => $s->logistics_company_id, 'seller_id' => $s->seller_id],
        ]);
        $this->tell($s, $s->receiverSide(), 'settlement.reminder', 'Please confirm a payment',
            "{$this->name($s, $s->payerSide())} recorded {$this->peso($s)} for {$this->week($s)} on {$s->paid_at?->setTimezone(DirectSettlement::TZ)->format('M j')} (ref {$s->reference}). Check your GCash, then confirm it or report that it did not arrive.");

        return $s->fresh();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Moves the current, voided payment into the history and clears it, ready for the next one. */
    private function clearedAttempt(CourierSettlement $s): array
    {
        $attempts = $s->attempts ?? [];
        $attempts[] = [
            'reference'       => $s->reference,
            'receipt_path'    => $s->receipt_path,
            'amount'          => abs((float) $s->net_amount),
            'paid_at'         => $s->paid_at?->toIso8601String(),
            'dispute_reason'  => $s->dispute_reason,
            'disputed_at'     => $s->disputed_at?->toIso8601String(),
            'resolution_note' => $s->resolution_note,
            'voided_at'       => $s->reopened_at?->toIso8601String(),
        ];

        return [
            'attempts'     => $attempts,
            'disputed_at'  => null, 'disputed_by' => null, 'dispute_reason' => null,
            'reopened_at'  => null, 'resolved_at' => null, 'resolved_by' => null, 'resolution' => null, 'resolution_note' => null,
            'reminded_at'  => null,
        ];
    }

    /** A notification to one side: the shop (by its payout settings) or every member of the courier company. */
    private function tell(CourierSettlement $s, string $side, string $kind, string $title, string $body): void
    {
        $meta = ['settlement_id' => $s->id];
        if ($side === 'seller') {
            $this->notifier->toSeller($s->seller_id, 'payouts', $kind, $title, $body, '/seller/payments?tab=couriers', $meta);
        } else {
            $this->notifier->send($this->notifier->companyMembers($s->logistics_company_id), $kind, $title, $body, '/logistics/money?tab=shops', $meta);
        }
    }

    public function name(CourierSettlement $s, string $side): string
    {
        return $side === 'seller'
            ? (SellerProfile::where('user_id', $s->seller_id)->value('shop_name') ?? 'The shop')
            : (LogisticsCompany::whereKey($s->logistics_company_id)->value('name') ?? 'The courier');
    }

    private function peso(CourierSettlement $s): string
    {
        return '₱' . number_format(abs((float) $s->net_amount), 2);
    }

    private function week(CourierSettlement $s): string
    {
        return 'the week of ' . $s->period_start->format('M j') . '–' . $s->period_end->format('M j');
    }
}
