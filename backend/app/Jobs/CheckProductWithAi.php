<?php

namespace App\Jobs;

use App\Models\Product;
use App\Services\Ai\ProductChecker;
use App\Services\MailNotifier;
use App\Services\Notifier;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Runs the AI product check (Amaru task 7) on a product the seller just published. Until it finishes the product waits
 * in review (status pending_review, ai_review_status checking), so buyers never see an unchecked listing.
 *
 * - approve: the product goes live.
 * - send_to_admin: it stays in the admin's Products > Pending review list with the AI's reason.
 * - reject: also sent to the admin while AI_PRODUCT_AUTO_REJECT is off (the admin makes the final call); with it on,
 *   the product is rejected and the seller sees the reason.
 * - the AI cannot be reached or declines: sent to the admin instead of publishing it.
 */
class CheckProductWithAi implements ShouldQueue
{
    use Queueable;

    /** The SDK already retries a failed request; a second job attempt would only repeat the wait. */
    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public readonly int $productId)
    {
        $this->afterCommit();
    }

    public function handle(ProductChecker $checker): void
    {
        $product = $this->waiting();
        if (! $product) {
            return;
        }

        try {
            $result = $checker->check($product);
        } catch (\Throwable $e) {
            Log::warning('AI product check failed; sending the product to an admin.', ['product_id' => $product->id, 'error' => $e->getMessage()]);
            $this->toAdmin($product, 'unavailable', null, 'The AI check could not run, so a person needs to review this product.');

            return;
        }

        // The seller may have edited or unpublished it, or an admin may have decided, while the AI was answering.
        $product = $this->waiting();
        if (! $product) {
            return;
        }

        match ($result['verdict']) {
            ProductChecker::APPROVE => $this->approve($product, $result['reason']),
            ProductChecker::REJECT  => config('ai.product_check.auto_reject')
                ? $this->reject($product, $result['reason'])
                : $this->toAdmin($product, 'flagged', ProductChecker::REJECT, $result['reason']),
            default                 => $this->toAdmin($product, 'flagged', ProductChecker::SEND_TO_ADMIN, $result['reason']),
        };
    }

    /** A crash outside handle() (a timeout, the worker stopping): the product still goes to a person. */
    public function failed(?\Throwable $e): void
    {
        if ($product = $this->waiting()) {
            $this->toAdmin($product, 'unavailable', null, 'The AI check could not run, so a person needs to review this product.');
        }
    }

    private function waiting(): ?Product
    {
        $product = Product::find($this->productId);

        return $product && $product->status === 'pending_review' && $product->ai_review_status === 'checking' ? $product : null;
    }

    private function approve(Product $product, string $reason): void
    {
        $product->update([
            'status'            => 'active',
            'published_at'      => $product->published_at ?? now(),
            'rejection_reason'  => null,
            'ai_review_status'  => 'approved',
            'ai_review_verdict' => ProductChecker::APPROVE,
            'ai_review_reason'  => $reason,
            'ai_reviewed_at'    => now(),
        ]);
        app(Notifier::class)->listingDecision($product, 'Product is live', "{$product->name} passed the listing check. Buyers can find and order it now.");
    }

    private function reject(Product $product, string $reason): void
    {
        $product->update([
            'status'            => 'rejected',
            'rejection_reason'  => $reason,
            'ai_review_status'  => 'rejected',
            'ai_review_verdict' => ProductChecker::REJECT,
            'ai_review_reason'  => $reason,
            'ai_reviewed_at'    => now(),
        ]);
        app(MailNotifier::class)->productRejected($product->loadMissing('seller'), $reason);
        app(Notifier::class)->listingDecision($product, 'Changes needed', "{$product->name} was not approved: {$reason}");
    }

    private function toAdmin(Product $product, string $status, ?string $verdict, string $reason): void
    {
        $product->update([
            'ai_review_status'  => $status,
            'ai_review_verdict' => $verdict,
            'ai_review_reason'  => $reason,
            'ai_reviewed_at'    => now(),
        ]);

        $notifier = app(Notifier::class);
        $notifier->toAdmins('product.flagged', 'Product waiting for review',
            "{$product->name}: " . ($status === 'unavailable' ? 'the AI check could not run.' : $reason),
            '/admin/products?status=pending_review', ['product_id' => $product->id]);
        // The seller is told it is being looked at, not what the AI suspected.
        $notifier->listingDecision($product, 'Product in review', "{$product->name} is waiting for a quick check by the Loved-IT team. We'll let you know when it's live.");
    }
}
