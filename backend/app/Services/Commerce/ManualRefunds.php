<?php

namespace App\Services\Commerce;

use App\Models\Order;
use App\Models\Refund;
use App\Models\User;
use App\Services\MailNotifier;
use App\Services\Notifier;
use App\Support\Gcash;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Refunds the shop sends by hand.
 *
 * A GCash order was paid into the shop's GCash, and the cash of a cash-on-delivery order reaches the shop in the
 * courier's weekly settlement, so when such an order is refunded (cancelled after payment, an approved return, a
 * failed or lost delivery) the shop sends the money to the buyer's GCash itself:
 *
 *   awaiting_account → the buyer says which GCash gets it (skipped when they gave it with the return request)
 *   awaiting_shop    → the shop sends it within orders.refund_send_days; late, Loved-IT is told
 *   sent             → the shop recorded the 13-digit reference and the receipt; the buyer confirms it arrived,
 *                      or reports it did not within orders.refund_confirm_days (silence counts as received)
 *   not_received     → Loved-IT reads both sides: received, or the shop sends it again
 *   received         → done; the order shows the refund as refunded
 *
 * The amount is always the amount the order says is refunded; nothing here changes it. Sandbox e-wallet and card
 * refunds stay instant (OrderCanceller) and have no row.
 */
class ManualRefunds
{
    public function __construct(private readonly Notifier $notifier, private readonly MailNotifier $mail) {}

    public static function sendDays(): int
    {
        return (int) config('orders.refund_send_days', 3);
    }

    public static function confirmDays(): int
    {
        return (int) config('orders.refund_confirm_days', 3);
    }

    /**
     * Opens the refund of an order (inside the transaction that refunds it). An order has at most one: a second call
     * returns the first.
     */
    public function open(Order $order, string $cause, float $amount, ?string $gcashNumber = null, ?string $gcashName = null): Refund
    {
        $existing = Refund::where('order_id', $order->id)->lockForUpdate()->first();
        if ($existing) {
            return $existing;
        }

        $number = Gcash::normalize($gcashNumber);
        $name = $number ? (trim((string) $gcashName) ?: null) : null;
        $ready = $number && $name;

        $refund = Refund::create([
            'order_id'     => $order->id,
            'buyer_id'     => $order->buyer_id,
            'seller_id'    => $order->items()->value('seller_id'),
            'amount'       => number_format($amount, 2, '.', ''),
            'cause'        => $cause,
            'status'       => $ready ? Refund::STATUS_AWAITING_SHOP : Refund::STATUS_AWAITING_ACCOUNT,
            'gcash_number' => $ready ? $number : null,
            'gcash_name'   => $ready ? $name : null,
            'send_by'      => $ready ? now()->addDays(self::sendDays()) : null,
        ]);
        $order->forceFill(['refund_status' => 'pending', 'refund_amount' => $refund->amount])->save();

        if ($ready) {
            $this->tellShopToSend($refund);
            $this->notifier->toUserId($order->buyer_id, 'refund.pending', 'Refund on its way',
                "The shop will send {$this->peso($refund->amount)} for order {$order->order_number} to your GCash within " . self::sendDays() . ' days.',
                $this->buyerLink($order), ['order_id' => $order->id]);
        } else {
            $this->notifier->toUserId($order->buyer_id, 'refund.account_needed', 'Where should we send your refund?',
                "Order {$order->order_number}: tell us which GCash account gets your {$this->peso($refund->amount)} refund.",
                $this->buyerLink($order), ['order_id' => $order->id]);
            DB::afterCommit(fn () => $this->mail->refundAccountNeeded($refund->fresh(['order', 'buyer'])));
        }

        return $refund;
    }

    /** The buyer says (or corrects) which GCash gets the money, until the shop has sent it. */
    public function setAccount(Refund $refund, User $buyer, string $number, string $name): Refund
    {
        return DB::transaction(function () use ($refund, $buyer, $number, $name) {
            $locked = $this->lock($refund);
            abort_unless((int) $locked->buyer_id === (int) $buyer->id, 404, 'Refund not found.');
            abort_unless(in_array($locked->status, [Refund::STATUS_AWAITING_ACCOUNT, Refund::STATUS_AWAITING_SHOP], true), 409,
                'The shop already sent this refund, so the account can no longer be changed.');

            $first = $locked->status === Refund::STATUS_AWAITING_ACCOUNT;
            $locked->update([
                'gcash_number' => $number,
                'gcash_name'   => $name,
                'status'       => Refund::STATUS_AWAITING_SHOP,
                'send_by'      => $first ? now()->addDays(self::sendDays()) : $locked->send_by,
            ]);
            if ($first) {
                $this->tellShopToSend($locked);
            } else {
                $this->notifier->toSeller($locked->seller_id, 'returns', 'refund.account_changed', 'Refund account changed',
                    "The buyer of order {$locked->order->order_number} changed the GCash account for the refund. Send it to " . Gcash::format($number) . '.',
                    $this->sellerLink($locked->order), ['order_id' => $locked->order_id]);
            }

            return $locked->fresh('order');
        });
    }

    /** The shop sent the money: the 13-digit GCash reference and a screenshot of the receipt. */
    public function markSent(Refund $refund, User $seller, string $reference, UploadedFile $receipt): Refund
    {
        $path = null;
        try {
            return DB::transaction(function () use ($refund, $seller, $reference, $receipt, &$path) {
                $locked = $this->lock($refund);
                abort_unless((int) $locked->seller_id === (int) $seller->id, 404, 'Refund not found.');
                if ($locked->status === Refund::STATUS_AWAITING_ACCOUNT) {
                    abort(409, 'The buyer has not said which GCash account gets the refund yet. You will be told when they do.');
                }
                abort_unless($locked->status === Refund::STATUS_AWAITING_SHOP, 409, 'This refund was already sent.');

                $path = $receipt->store(Refund::RECEIPT_DIR, Refund::RECEIPT_DISK);
                $locked->update([
                    'status'       => Refund::STATUS_SENT,
                    'reference'    => $reference,
                    'receipt_path' => $path,
                    'sent_at'      => now(),
                    'confirm_by'   => now()->addDays(self::confirmDays()),
                ]);

                $order = $locked->order;
                $this->notifier->toUserId($locked->buyer_id, 'refund.sent', 'Refund sent: please check your GCash',
                    "The shop sent {$this->peso($locked->amount)} for order {$order->order_number} to " . Gcash::format($locked->gcash_number) . ". Confirm it arrived, or tell us within " . self::confirmDays() . ' days if it did not.',
                    $this->buyerLink($order), ['order_id' => $order->id]);
                DB::afterCommit(fn () => $this->mail->refundSent($locked->fresh(['order', 'buyer'])));

                return $locked->fresh('order');
            });
        } catch (\Throwable $e) {
            if ($path) {
                Storage::disk(Refund::RECEIPT_DISK)->delete($path);
            }
            throw $e;
        }
    }

    /** The buyer got the money (also after reporting it missing, when it turns up). */
    public function confirm(Refund $refund, User $buyer): Refund
    {
        return DB::transaction(function () use ($refund, $buyer) {
            $locked = $this->lock($refund);
            abort_unless((int) $locked->buyer_id === (int) $buyer->id, 404, 'Refund not found.');
            abort_if($locked->status === Refund::STATUS_RECEIVED, 409, 'You already confirmed this refund.');
            abort_unless(in_array($locked->status, [Refund::STATUS_SENT, Refund::STATUS_NOT_RECEIVED], true), 409,
                'The shop has not sent this refund yet.');

            return $this->finish($locked, auto: false);
        });
    }

    /** The buyer says nothing arrived. Loved-IT reads both sides. */
    public function report(Refund $refund, User $buyer, string $note): Refund
    {
        return DB::transaction(function () use ($refund, $buyer, $note) {
            $locked = $this->lock($refund);
            abort_unless((int) $locked->buyer_id === (int) $buyer->id, 404, 'Refund not found.');
            abort_if($locked->status === Refund::STATUS_NOT_RECEIVED, 409, 'You already reported this refund. Loved-IT is looking into it.');
            abort_unless($locked->status === Refund::STATUS_SENT, 409, $locked->status === Refund::STATUS_RECEIVED
                ? 'This refund is already confirmed as received.'
                : 'The shop has not sent this refund yet.');

            $locked->update(['status' => Refund::STATUS_NOT_RECEIVED, 'reported_at' => now(), 'report_note' => $note]);
            $order = $locked->order;
            $this->notifier->toAdmins('refund.not_received', 'Refund reported as not received',
                "Order {$order->order_number}: the buyer says the shop's {$this->peso($locked->amount)} refund did not arrive. Check the receipt and decide.",
                '/admin/disputes?tab=refunds', ['order_id' => $order->id, 'refund_id' => $locked->id]);
            $this->notifier->toSeller($locked->seller_id, 'returns', 'refund.not_received', 'Buyer did not receive your refund',
                "The buyer of order {$order->order_number} says the refund did not arrive. Loved-IT will check your receipt.",
                $this->sellerLink($order), ['order_id' => $order->id]);
            DB::afterCommit(fn () => $this->mail->refundReported($locked->fresh(['order', 'seller'])));

            return $locked->fresh('order');
        });
    }

    /**
     * Loved-IT decides a reported (or very late) refund: it counts as received, or the shop sends it again. The
     * earlier transfer stays in the history.
     *
     * @param 'received'|'send_again' $decision
     */
    public function resolve(Refund $refund, User $admin, string $decision, string $note): Refund
    {
        return DB::transaction(function () use ($refund, $admin, $decision, $note) {
            $locked = $this->lock($refund);
            abort_unless($locked->isOpen(), 409, 'This refund is already finished.');
            if ($decision === 'send_again') {
                abort_unless($locked->status === Refund::STATUS_NOT_RECEIVED, 409, 'Only a refund the buyer reported as not received can be sent again.');
                $locked->update([
                    'attempts'     => [...($locked->attempts ?? []), [
                        'reference' => $locked->reference, 'receipt_path' => $locked->receipt_path, 'sent_at' => $locked->sent_at?->toIso8601String(),
                        'reported_at' => $locked->reported_at?->toIso8601String(), 'report_note' => $locked->report_note,
                    ]],
                    'status' => Refund::STATUS_AWAITING_SHOP, 'send_by' => now()->addDays(self::sendDays()), 'overdue_notified_at' => null,
                    'reference' => null, 'receipt_path' => null, 'sent_at' => null, 'confirm_by' => null, 'reported_at' => null, 'report_note' => null,
                    'resolved_by' => $admin->id, 'resolved_at' => now(), 'resolution_note' => $note,
                ]);
                $order = $locked->order;
                $this->notifier->toUserId($locked->buyer_id, 'refund.send_again', 'The shop will send your refund again',
                    "Order {$order->order_number}: Loved-IT checked your report. The shop has to send {$this->peso($locked->amount)} again within " . self::sendDays() . ' days.',
                    $this->buyerLink($order), ['order_id' => $order->id]);
                $this->tellShopToSend($locked, again: true, note: $note);

                return $locked->fresh('order');
            }

            abort_if($locked->status === Refund::STATUS_AWAITING_ACCOUNT, 409, 'The buyer has not given a GCash account yet, so nothing was sent.');
            $locked->forceFill(['resolved_by' => $admin->id, 'resolved_at' => now(), 'resolution_note' => $note])->save();

            return $this->finish($locked, auto: false, byAdmin: true);
        });
    }

    /**
     * The deadlines: a sent refund the buyer did not answer counts as received; a shop late to send is told again,
     * and Loved-IT is told, once.
     *
     * @return array{confirmed: int, overdue: int}
     */
    public function processDeadlines(): array
    {
        $confirmed = 0;
        foreach (Refund::where('status', Refund::STATUS_SENT)->where('confirm_by', '<=', now())->pluck('id') as $id) {
            DB::transaction(function () use ($id, &$confirmed) {
                $locked = Refund::whereKey($id)->lockForUpdate()->first();
                if ($locked && $locked->status === Refund::STATUS_SENT && $locked->confirm_by?->lte(now())) {
                    $this->finish($locked, auto: true);
                    $confirmed++;
                }
            });
        }

        $overdue = 0;
        foreach (Refund::with('order')->where('status', Refund::STATUS_AWAITING_SHOP)->where('send_by', '<=', now())->whereNull('overdue_notified_at')->get() as $refund) {
            DB::transaction(function () use ($refund) {
                $refund->forceFill(['overdue_notified_at' => now()])->save();
                $order = $refund->order;
                $this->notifier->toAdmins('refund.overdue', 'A shop is late with a refund',
                    "Order {$order->order_number}: the shop has not sent the {$this->peso($refund->amount)} refund it owes the buyer.",
                    '/admin/disputes?tab=refunds', ['order_id' => $order->id, 'refund_id' => $refund->id]);
                $this->notifier->send(User::find($refund->seller_id), 'refund.overdue', 'Your refund is late',
                    "Order {$order->order_number}: send the buyer's {$this->peso($refund->amount)} refund now. Loved-IT has been told.",
                    $this->sellerLink($order), ['order_id' => $order->id]);
                DB::afterCommit(fn () => $this->mail->refundToSend($refund->fresh(['order', 'seller']), late: true));
            });
            $overdue++;
        }

        return ['confirmed' => $confirmed, 'overdue' => $overdue];
    }

    /**
     * The refund as $viewer sees it. The GCash number goes to the buyer, the shop and admins only (all three need it).
     *
     * @param 'buyer'|'seller'|'admin' $viewer
     */
    public static function present(?Refund $r, string $viewer): ?array
    {
        if (! $r) {
            return null;
        }

        return [
            'id'              => $r->id,
            'status'          => $r->status,
            'cause'           => $r->cause,
            'amount'          => (float) $r->amount,
            'gcash_number'    => Gcash::format($r->gcash_number),
            'gcash_name'      => $r->gcash_name,
            'send_by'         => $r->send_by?->toIso8601String(),
            'overdue'         => $r->overdue(),
            'reference'       => $r->reference,
            'has_receipt'     => (bool) $r->receipt_path,
            'sent_at'         => $r->sent_at?->toIso8601String(),
            'confirm_by'      => $r->confirm_by?->toIso8601String(),
            'received_at'     => $r->received_at?->toIso8601String(),
            'auto_confirmed'  => (bool) $r->auto_confirmed,
            'reported_at'     => $r->reported_at?->toIso8601String(),
            'report_note'     => $r->report_note,
            'resolution_note' => $r->resolution_note,
            'resolved_at'     => $r->resolved_at?->toIso8601String(),
            'times_sent_before' => count($r->attempts ?? []),
            'can_set_account' => $viewer === 'buyer' && in_array($r->status, [Refund::STATUS_AWAITING_ACCOUNT, Refund::STATUS_AWAITING_SHOP], true),
            'can_confirm'     => $viewer === 'buyer' && in_array($r->status, [Refund::STATUS_SENT, Refund::STATUS_NOT_RECEIVED], true),
            'can_report'      => $viewer === 'buyer' && $r->status === Refund::STATUS_SENT,
            'can_send'        => $viewer === 'seller' && $r->status === Refund::STATUS_AWAITING_SHOP,
            'can_decide'      => $viewer === 'admin' && in_array($r->status, [Refund::STATUS_SENT, Refund::STATUS_NOT_RECEIVED, Refund::STATUS_AWAITING_SHOP], true),
            'created_at'      => $r->created_at?->toIso8601String(),
        ];
    }

    private function finish(Refund $locked, bool $auto, bool $byAdmin = false): Refund
    {
        $locked->update(['status' => Refund::STATUS_RECEIVED, 'received_at' => now(), 'auto_confirmed' => $auto]);
        $order = Order::whereKey($locked->order_id)->lockForUpdate()->first();
        $order?->forceFill(['refund_status' => 'refunded', 'refund_amount' => $locked->amount, 'refunded_at' => now()])->save();

        if ($order) {
            $how = $byAdmin ? 'Loved-IT closed it as received' : ($auto ? 'the buyer did not report a problem in ' . self::confirmDays() . ' days' : 'the buyer confirmed it arrived');
            $this->notifier->toSeller($locked->seller_id, 'returns', 'refund.received', 'Refund done',
                "Order {$order->order_number}: the {$this->peso($locked->amount)} refund is done ({$how}).",
                $this->sellerLink($order), ['order_id' => $order->id]);
            if ($byAdmin || $auto) {
                $this->notifier->toUserId($locked->buyer_id, 'refund.received', 'Refund closed',
                    "Order {$order->order_number}: your {$this->peso($locked->amount)} refund is recorded as received ({$how}).",
                    $this->buyerLink($order), ['order_id' => $order->id]);
            }
        }

        return $locked->fresh('order');
    }

    private function tellShopToSend(Refund $refund, bool $again = false, ?string $note = null): void
    {
        $order = $refund->order ?? Order::find($refund->order_id);
        $this->notifier->send(User::find($refund->seller_id), 'refund.to_send', $again ? 'Send the refund again' : 'Refund to send',
            "Order {$order->order_number}: send {$this->peso($refund->amount)} to " . Gcash::format($refund->gcash_number) . " ({$refund->gcash_name}) within " . self::sendDays() . ' days, then record the reference.',
            $this->sellerLink($order), ['order_id' => $order->id, 'refund_id' => $refund->id]);
        DB::afterCommit(fn () => $this->mail->refundToSend($refund->fresh(['order', 'seller']), again: $again, note: $note));
    }

    private function lock(Refund $refund): Refund
    {
        return Refund::with('order')->whereKey($refund->id)->lockForUpdate()->firstOrFail();
    }

    private function buyerLink(Order $order): string
    {
        return "/settings/orders?order={$order->id}";
    }

    private function sellerLink(Order $order): string
    {
        return "/seller/orders?order={$order->id}";
    }

    private function peso(float|string|null $amount): string
    {
        return '₱' . number_format((float) $amount, 2);
    }
}
