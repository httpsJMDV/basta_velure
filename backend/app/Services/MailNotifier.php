<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Mail\NoticeMail;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\PayoutRequest;
use App\Models\Product;
use App\Models\Rider;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Support\NotificationPreferences;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Every transactional email that is not one of the dedicated application mailables: account, seller, product, order,
 * payment, return and payout notices. Each method builds the content and queues a NoticeMail.
 *
 * Sending never breaks the action that triggered it: a failure to queue is logged and swallowed. NoticeMail is queued
 * after commit, so an action that rolls back sends nothing. The queue worker (`php artisan queue:work`) delivers them.
 */
class MailNotifier
{
    private static bool $muted = false;

    /**
     * Runs $work without sending any notice (the demo seeder builds orders through the state machine and must not
     * email its fake accounts).
     *
     * @template T
     * @param  callable(): T  $work
     * @return T
     */
    public static function muted(callable $work): mixed
    {
        $previous = self::$muted;
        self::$muted = true;
        try {
            return $work();
        } finally {
            self::$muted = $previous;
        }
    }

    // ── Accounts ─────────────────────────────────────────────────────────────

    public function accountSuspended(User $user): void
    {
        $this->send($user, 'Your Loved-IT account has been suspended', 'account_suspended', [
            'tone' => 'danger',
            'label' => 'Account suspended',
            'title' => 'Your account is suspended.',
            'paragraphs' => [
                'An administrator has suspended your Loved-IT account, so you cannot sign in for now.',
                'This usually follows a report or a breach of our platform rules. If you think this is a mistake, reply through the help centre and our team will review it.',
            ],
            'actionUrl' => $this->url('/help/safety'),
            'actionLabel' => 'Contact support',
            'footer' => 'You received this email because of a change to your Loved-IT account status.',
        ]);
    }

    public function accountReactivated(User $user): void
    {
        $this->send($user, 'Your Loved-IT account is active again', 'account_reactivated', [
            'tone' => 'success',
            'label' => 'Account reactivated',
            'title' => 'Welcome back.',
            'paragraphs' => ['Your Loved-IT account has been reactivated. You can sign in and pick up where you left off.'],
            'actionUrl' => $this->url('/login'),
            'actionLabel' => 'Sign in to Loved-IT',
            'footer' => 'You received this email because of a change to your Loved-IT account status.',
        ]);
    }

    /**
     * The 6-digit code for a new account, a new email address or a new mobile number. Sent at once (not queued): the
     * person is waiting on the verification screen, and the code only works for a few minutes.
     */
    public function verificationCode(User $user, string $code, string $purpose, string $sendTo, int $minutes): void
    {
        [$subject, $title, $lead] = match ($purpose) {
            \App\Models\EmailOtp::PURPOSE_EMAIL_CHANGE => [
                'Confirm your new Loved-IT email address',
                'Confirm your new email.',
                'Enter this code in your Loved-IT account settings to change your sign-in email to this address. Until you do, your old email keeps working.',
            ],
            \App\Models\EmailOtp::PURPOSE_PHONE_CHANGE => [
                'Confirm your new Loved-IT mobile number',
                'Confirm your new mobile number.',
                'Enter this code in your Loved-IT account settings to save your new mobile number. Your number does not change until you do.',
            ],
            default => [
                'Your Loved-IT verification code',
                'Verify your email.',
                'Welcome to Loved-IT. Enter this code on the verification page to activate your account.',
            ],
        };

        $this->sendNow($sendTo, $user->first_name, $subject, 'verification_code', [
            'label' => 'Verification code',
            'title' => $title,
            'paragraphs' => [$lead],
            'highlight' => ['title' => 'Your code', 'body' => implode(' ', str_split($code, 3))],
            'note' => "The code works for {$minutes} minutes and only once. If you ask for a new code, this one stops working.",
            'footer' => 'If you did not ask for this code, you can ignore this email; nothing changes without it.',
        ]);
    }

    /**
     * The one-time link a rider uses to set a password (A13): sent when their courier company adds them, or when the
     * hub ($approvedHub) approves the application they made on the "Become a rider" form.
     */
    public function riderActivation(User $user, string $companyName, string $link, int $hours, ?string $approvedHub = null): void
    {
        $this->sendNow($user->email, $user->first_name, $approvedHub ? 'Your Loved-IT rider application is approved' : 'Activate your Loved-IT rider account', 'rider_activation', [
            'tone' => $approvedHub ? 'success' : null,
            'label' => $approvedHub ? 'Rider application' : 'Rider account',
            'title' => $approvedHub ? 'You are approved. Set your password to start.' : 'Set your password to start delivering.',
            'paragraphs' => [
                $approvedHub
                    ? "{$approvedHub} ({$companyName}) approved your rider application. Open the link below to set your password and activate your account."
                    : "{$companyName} added you as a rider on Loved-IT. Open the link below to set your password and activate your account.",
            ],
            'details' => array_filter(['Company' => $companyName, 'Hub' => $approvedHub, 'Sign-in email' => $user->email]),
            'actionUrl' => $link,
            'actionLabel' => 'Activate my account',
            'note' => "The link works once, for {$hours} hours. If it expires, ask {$companyName} to send a new one.",
            'footer' => $approvedHub
                ? 'You received this email because you applied to ride for a courier on Loved-IT.'
                : 'You received this email because a courier company added you as a rider on Loved-IT.',
        ]);
    }

    /** The hub or the courier did not approve an application made on the "Become a rider" form. */
    public function riderApplicationRejected(Rider $rider, string $reason): void
    {
        $hub = $rider->sortingCenter?->hub_name ?? 'The hub';
        $this->send($rider->user, 'Update on your Loved-IT rider application', 'rider_application_rejected', [
            'tone' => 'danger',
            'label' => 'Rider application',
            'title' => 'Your application was not approved.',
            'paragraphs' => [
                "{$hub} reviewed your rider application and could not approve it.",
                'You can fix what they pointed out and apply again with the same email.',
            ],
            'highlight' => ['title' => 'Reason', 'body' => $reason],
            'actionUrl' => $this->url('/register/rider' . ($rider->sorting_center_id ? '?hub=' . $rider->sorting_center_id : '')),
            'actionLabel' => 'Apply again',
            'footer' => 'You received this email because you applied to be a Loved-IT rider.',
        ]);
    }

    /** The courier company did not approve a rider waiting for verification. */
    public function riderNotApproved(Rider $rider, string $reason): void
    {
        $this->send($rider->user, 'Update on your Loved-IT rider account', 'rider_not_approved', [
            'tone' => 'danger',
            'label' => 'Rider verification',
            'title' => 'Your rider account was not approved.',
            'paragraphs' => ['Your courier company reviewed your rider details and documents and could not approve them yet.'],
            'highlight' => ['title' => 'Reason', 'body' => $reason],
            'actionUrl' => $this->url('/rider/account'),
            'actionLabel' => 'Open your rider account',
            'footer' => 'You received this email because you are a rider on Loved-IT.',
        ]);
    }

    // ── Seller, hub and courier applications ─────────────────────────────────

    public function sellerApplicationApproved(SellerProfile $profile): void
    {
        $this->send($profile->user, 'Your Loved-IT shop is approved', 'seller_approved', [
            'tone' => 'success',
            'label' => 'Seller application approved',
            'title' => 'Your shop is open.',
            'paragraphs' => [
                'Great news! Our admin team reviewed your documents and approved ' . $profile->shop_name . '.',
                'Add your first products from the Seller Center. Each product is reviewed before it appears in the store.',
            ],
            'details' => ['Shop' => $profile->shop_name, 'Application status' => 'Approved'],
            'actionUrl' => $this->url('/seller'),
            'actionLabel' => 'Open Seller Center',
            'footer' => 'You received this email because you applied to sell on Loved-IT.',
        ]);
    }

    public function sellerApplicationRejected(SellerProfile $profile, string $reason): void
    {
        $this->send($profile->user, 'Update on your Loved-IT seller application', 'seller_rejected', [
            'tone' => 'danger',
            'label' => 'Seller application update',
            'title' => 'An update on your application.',
            'paragraphs' => [
                'Thank you for applying to sell on Loved-IT. After reviewing your documents, we were unable to approve ' . $profile->shop_name . ' at this time.',
                'You can fix the issue below and resubmit from your account.',
            ],
            'highlight' => ['title' => 'Review feedback', 'body' => $reason],
            'details' => ['Shop' => $profile->shop_name, 'Application status' => 'Not approved'],
            'actionUrl' => $this->url('/register/seller'),
            'actionLabel' => 'Review and resubmit',
            'footer' => 'You received this email because you applied to sell on Loved-IT.',
        ]);
    }

    public function hubApplicationReceived(SortingCenter $hub): void
    {
        $courier = LogisticsCompany::summaryFor($hub->logistics_company_id)['name'] ?? 'the courier company';

        $this->send($hub->user, 'We received your Loved-IT hub application', 'hub_received', [
            'tone' => 'info',
            'label' => 'Hub application received',
            'title' => 'Your hub application is with us.',
            'paragraphs' => [
                'Thank you for applying to run ' . $hub->hub_name . ' for ' . $courier . '.',
                'The courier company will check your DTI permit, coverage area and the ID on your account. We will email you the decision.',
            ],
            'details' => [
                'Hub' => $hub->hub_name,
                'Courier' => $courier,
                'Location' => trim($hub->address_city . ', ' . $hub->address_province, ', '),
                'Coverage' => count($hub->coverage_barangays ?? []) . ' barangay(s)',
                'Status' => 'Under review',
            ],
            'actionUrl' => $this->url('/register/hub'),
            'actionLabel' => 'View application status',
            'footer' => 'You received this email because you applied to run a logistics hub on Loved-IT.',
        ]);
    }

    /** A visitor applied on the "Become a rider" form: the applicant and the hub that reviews it are told. */
    public function riderApplicationReceived(Rider $rider): void
    {
        $hubName = $rider->sortingCenter?->hub_name ?? 'the hub';

        $this->send($rider->user, 'We received your Loved-IT rider application', 'rider_received', [
            'tone' => 'info',
            'label' => 'Rider application received',
            'title' => 'Your rider application is in.',
            'paragraphs' => [
                'Thank you for applying to deliver for ' . $hubName . '.',
                'The hub checks your driver\'s license and OR/CR, usually within 1 to 3 business days. If they approve you, we email you a link to set your password; you cannot sign in until then.',
            ],
            'details' => ['Hub' => $hubName, 'Vehicle' => $rider->vehicle_type . ' · ' . $rider->plate_number, 'Status' => 'Waiting for the hub'],
            'footer' => 'You received this email because someone applied to be a Loved-IT rider with this address. If it was not you, you can ignore it.',
        ]);

        // The hub that must review it.
        $owner = $rider->sortingCenter?->user;
        if ($owner) {
            $this->send($owner, 'New courier application for ' . $hubName, 'hub_new_rider', [
                'tone' => 'info',
                'label' => 'New courier application',
                'title' => 'A courier wants to join your hub.',
                'paragraphs' => [trim($rider->user->first_name . ' ' . $rider->user->last_name) . ' applied to deliver for ' . $hubName . '. Review their documents to approve or decline.'],
                'details' => ['Applicant' => trim($rider->user->first_name . ' ' . $rider->user->last_name), 'Vehicle' => $rider->vehicle_type . ' · ' . $rider->plate_number],
                'actionUrl' => $this->url('/hub/riders'),
                'actionLabel' => 'Review application',
                'footer' => 'You received this email because you run ' . $hubName . ' on Loved-IT.',
            ]);
        }
    }

    // ── Courier companies ────────────────────────────────────────────────────

    public function courierApplicationReceived(LogisticsCompany $company): void
    {
        $company->loadMissing('owner');
        $this->send($company->owner, 'We received your courier company application', 'courier_received', [
            'tone' => 'info',
            'label' => 'Rider application received',
            'title' => $company->name . ' is under review.',
            'paragraphs' => [
                'Thank you for applying to deliver for Loved-IT shops as ' . $company->name . '.',
                'Our admin team checks your business permit and company details, then emails you the decision. Once approved, you can open your courier portal and start onboarding hubs.',
            ],
            'details' => ['Company' => $company->name, 'Code' => $company->code, 'Status' => 'Under review'],
            'actionUrl' => $this->url('/register/courier'),
            'actionLabel' => 'View application status',
            'footer' => 'You received this email because you applied to run a courier company on Loved-IT.',
        ]);
    }

    public function courierApplicationDecided(LogisticsCompany $company, bool $approved, ?string $reason = null): void
    {
        $company->loadMissing('owner');
        $this->send($company->owner, $approved ? $company->name . ' is approved on Loved-IT' : 'Update on your courier company application', $approved ? 'courier_approved' : 'courier_rejected', array_filter([
            'tone' => $approved ? 'success' : 'danger',
            'label' => $approved ? 'Courier company approved' : 'Courier application update',
            'title' => $approved ? 'Your courier company is live.' : 'An update on your application.',
            'paragraphs' => $approved
                ? ['Our admin team approved ' . $company->name . '. Open your courier portal to review hub applications and watch your network.', 'Hubs can now choose ' . $company->name . ' when they apply.']
                : ['After reviewing your application, we were unable to approve ' . $company->name . ' at this time.', 'You can fix the issue below and resubmit from your account.'],
            'highlight' => (! $approved && $reason) ? ['title' => 'Review feedback', 'body' => $reason] : null,
            'details' => ['Company' => $company->name, 'Code' => $company->code, 'Status' => $approved ? 'Approved' : 'Not approved'],
            'actionUrl' => $this->url($approved ? '/logistics' : '/register/courier'),
            'actionLabel' => $approved ? 'Open courier portal' : 'Review and resubmit',
            'footer' => 'You received this email because you applied to run a courier company on Loved-IT.',
        ]));
    }

    /** A hub chose this courier: tell the courier's team there is an application to review. */
    public function courierNewHubApplication(SortingCenter $hub): void
    {
        $company = $hub->logisticsCompany;
        if (! $company) {
            return;
        }
        $members = $company->members()->with('user')->get()->pluck('user')->filter();
        foreach ($members as $member) {
            $this->send($member, 'New hub application: ' . $hub->hub_name, 'courier_new_hub', [
                'tone' => 'info',
                'label' => 'New hub application',
                'title' => 'A hub wants to join ' . $company->name . '.',
                'paragraphs' => [$hub->hub_name . ' applied to run a hub in your network. Review its permit, coverage and owner ID.'],
                'details' => [
                    'Hub' => $hub->hub_name,
                    'Location' => trim($hub->address_city . ', ' . $hub->address_province, ', '),
                    'Coverage' => count($hub->coverage_barangays ?? []) . ' barangay(s)',
                ],
                'actionUrl' => $this->url('/logistics/hubs'),
                'actionLabel' => 'Review application',
                'footer' => 'You received this email because you run ' . $company->name . ' on Loved-IT.',
            ]);
        }
    }

    // ── Products ─────────────────────────────────────────────────────────────

    public function productApproved(Product $product): void
    {
        $this->send($product->seller, 'Your product is live: ' . $product->name, 'product_approved', [
            'tone' => 'success',
            'label' => 'Product approved',
            'title' => $product->name . ' is now live.',
            'paragraphs' => ['Our team reviewed your product and approved it. Buyers can now find and order it in the store.'],
            'details' => $this->productDetails($product),
            'actionUrl' => $this->url('/products/' . $product->id),
            'actionLabel' => 'View in store',
            'footer' => 'You received this email because you sell on Loved-IT.',
        ]);
    }

    public function productRejected(Product $product, string $reason): void
    {
        $this->send($product->seller, 'Changes needed: ' . $product->name, 'product_rejected', [
            'tone' => 'danger',
            'label' => 'Product not approved',
            'title' => 'Your product needs changes.',
            'paragraphs' => ['We reviewed ' . $product->name . ' and could not approve it yet. Edit the product and submit it for review again.'],
            'highlight' => ['title' => 'Review feedback', 'body' => $reason],
            'details' => $this->productDetails($product),
            'actionUrl' => $this->url('/seller/products/' . $product->id . '/edit'),
            'actionLabel' => 'Edit product',
            'footer' => 'You received this email because you sell on Loved-IT.',
        ]);
    }

    public function productArchived(Product $product, string $reason): void
    {
        $this->send($product->seller, 'Your product was archived: ' . $product->name, 'product_archived', [
            'tone' => 'warning',
            'label' => 'Product archived',
            'title' => $product->name . ' was taken down.',
            'paragraphs' => ['An administrator archived this product, so buyers can no longer see or order it.'],
            'highlight' => ['title' => 'Reason', 'body' => $reason],
            'details' => $this->productDetails($product),
            'actionUrl' => $this->url('/seller/products'),
            'actionLabel' => 'View your products',
            'note' => 'If you think this is a mistake, contact support through the website.',
            'footer' => 'You received this email because you sell on Loved-IT.',
        ]);
    }

    public function productReactivated(Product $product): void
    {
        $this->send($product->seller, 'Your product is live again: ' . $product->name, 'product_reactivated', [
            'tone' => 'success',
            'label' => 'Product reactivated',
            'title' => $product->name . ' is back in the store.',
            'paragraphs' => ['An administrator reactivated this product. Buyers can see and order it again.'],
            'details' => $this->productDetails($product),
            'actionUrl' => $this->url('/products/' . $product->id),
            'actionLabel' => 'View in store',
            'footer' => 'You received this email because you sell on Loved-IT.',
        ]);
    }

    // ── Orders ───────────────────────────────────────────────────────────────

    /**
     * A checkout: one receipt to the buyer (every shop's order in it) and a "new order" to each seller.
     *
     * @param  array<int, Order>|Collection<int, Order>  $orders
     */
    public function ordersPlaced(array|Collection $orders): void
    {
        $orders = collect($orders)->each(fn (Order $o) => $o->loadMissing(['buyer', 'items.seller.sellerProfile']));
        $first = $orders->first();
        if (! $first || ! $first->buyer) {
            return;
        }

        $items = [];
        foreach ($orders as $order) {
            foreach ($order->items as $item) {
                $items[] = $this->itemRow($item, $order->items->first()?->seller?->sellerProfile?->shop_name);
            }
        }
        $subtotal = $orders->sum(fn (Order $o) => (float) $o->subtotal);
        $shipping = $orders->sum(fn (Order $o) => (float) $o->shipping_fee);
        $total = $orders->sum(fn (Order $o) => (float) $o->total);
        $cod = $first->payment_method === 'cod';

        $this->send($first->buyer, $orders->count() > 1 ? 'We received your orders' : 'We received your order ' . $first->order_number, 'order_placed', [
            'tone' => 'success',
            'label' => 'Order placed',
            'title' => 'Thank you for your order!',
            'paragraphs' => [
                $orders->count() > 1
                    ? 'Your checkout was split into ' . $orders->count() . ' orders, one per shop. Each shop confirms and ships its own order.'
                    : 'We sent your order to the shop. You will get an email when it is confirmed and on its way.',
                $cod
                    ? 'You chose cash on delivery: please prepare ' . $this->peso($total) . ' for the courier.'
                    : 'You paid with GCash. The shop checks your payment before preparing the order.',
            ],
            'items' => $items,
            'totals' => ['Items' => $this->peso($subtotal), 'Delivery' => $this->peso($shipping), 'Total' => $this->peso($total)],
            'details' => [
                $orders->count() > 1 ? 'Orders' : 'Order' => $orders->pluck('order_number')->implode("\n"),
                'Payment' => $cod ? 'Cash on delivery' : 'GCash',
                'Deliver to' => $this->address($first),
            ],
            'actionUrl' => $this->url('/settings/orders'),
            'actionLabel' => 'Track your order',
            'footer' => 'You received this email because you placed an order on Loved-IT.',
        ]);

        // An e-wallet or card order reaches the seller once it is paid (SandboxGateway), not while it waits for payment.
        foreach ($orders as $order) {
            if (! in_array($order->payment_method, ['e_wallet', 'card'], true)) {
                $this->sellerNewOrder($order);
            }
        }
    }

    /** "You have a new order": cash on delivery and GCash when placed, e-wallet and card when paid. */
    public function sellerNewOrder(Order $order): void
    {
        $order->loadMissing(['items.seller']);
        $seller = $order->items->first()?->seller;
        if (! $seller) {
            return;
        }
        [$paragraph, $payment] = match ($order->payment_method) {
            'cod'   => ['A buyer placed a cash-on-delivery order. Confirm it to start fulfilment.', 'Cash on delivery'],
            'gcash' => ['A buyer placed a GCash order. Check the payment proof, then confirm it to start fulfilment.', 'GCash'],
            default => ['A buyer placed and paid an order. Confirm it to start fulfilment.', $order->payment_method === 'card' ? 'Card (paid)' : 'E-wallet (paid)'],
        };
        $this->send($seller, 'New order ' . $order->order_number, 'seller_new_order', [
            'tone' => 'info',
            'label' => 'New order',
            'title' => 'You have a new order.',
            'paragraphs' => [$paragraph],
            'items' => $order->items->map(fn ($item) => $this->itemRow($item))->all(),
            'totals' => ['Items' => $this->peso($order->subtotal), 'Delivery fee' => $this->peso($order->shipping_fee), 'Order total' => $this->peso($order->total)],
            'details' => ['Order' => $order->order_number, 'Payment' => $payment, 'Ship to' => $this->address($order)],
            'actionUrl' => $this->url('/seller/orders'),
            'actionLabel' => 'Open order',
            'footer' => 'You received this email because a buyer ordered from your Loved-IT shop.',
        ]);
    }

    /** A product fell to its low-stock level or sold out (A29). Off by default; the seller can turn it on. */
    public function lowStock(Product $product, string $title, string $body): void
    {
        $product->loadMissing('seller');
        $this->send($product->seller, $title . ': ' . $product->name, 'stock_low', [
            'tone' => 'warning',
            'label' => $title,
            'title' => $title === 'Sold out' ? 'A product sold out.' : 'A product is running low.',
            'paragraphs' => [$body],
            'actionUrl' => $this->url("/seller/products/{$product->id}/edit"),
            'actionLabel' => 'Update stock',
            'footer' => 'You received this email because low-stock emails are on in your notification settings.',
        ]);
    }

    /** A buyer reviewed one of the seller's products. Off by default; the seller can turn it on. */
    public function newReview(\App\Models\Review $review): void
    {
        $review->loadMissing(['product.seller', 'buyer:id,first_name']);
        if (! $review->product?->seller) {
            return;
        }
        $this->send($review->product->seller, "New {$review->rating}-star review: {$review->product->name}", 'review_new', array_filter([
            'tone' => $review->rating >= 4 ? 'success' : 'info',
            'label' => 'New review',
            'title' => ($review->buyer?->first_name ?? 'A buyer') . " gave {$review->product->name} {$review->rating} out of 5.",
            'paragraphs' => ['Reply from your Reviews page so other buyers see your answer.'],
            'highlight' => $review->comment ? ['title' => 'Their review', 'body' => strip_tags($review->comment)] : null,
            'actionUrl' => $this->url('/seller/reviews'),
            'actionLabel' => 'Open reviews',
            'footer' => 'You received this email because review emails are on in your notification settings.',
        ]));
    }

    /** Status changes worth telling people about; every other step is visible in the app's tracking. */
    public function orderStatusChanged(Order $order, string $from, string $to): void
    {
        $order->loadMissing(['buyer', 'items.seller.sellerProfile', 'parcel']);
        $shop = $order->items->first()?->seller?->sellerProfile?->shop_name ?? 'the shop';
        $tracking = $order->parcel?->tracking_number;
        $orderDetails = array_filter([
            'Order' => $order->order_number,
            'Shop' => $shop,
            'Tracking number' => $tracking,
            'Order total' => $this->peso($order->total) . ($order->payment_method === 'cod' ? ' (cash on delivery)' : ''),
        ]);
        $buyerLink = ['actionUrl' => $this->url('/settings/orders'), 'actionLabel' => 'View your order'];
        $rider = $to === OrderStatus::OUT_FOR_DELIVERY->value ? Parcel::deliveryRiderFirstName($order->id) : null;
        $buyerFooter = ['footer' => 'You received this email because you placed an order on Loved-IT.'];

        // An accepted return (DISPUTED -> RETURNED) is told by returnResolved(), not as a failed delivery.
        $acceptedReturn = $to === OrderStatus::RETURNED->value && $from === OrderStatus::DISPUTED->value;

        $buyerNotice = $acceptedReturn ? null : match ($to) {
            OrderStatus::CONFIRMED->value => ['tone' => 'success', 'label' => 'Order confirmed', 'title' => 'Your order is confirmed.',
                'paragraphs' => [$order->payment_method === 'gcash'
                    ? $shop . ' received your GCash payment and confirmed your order. They will start preparing it.'
                    : $shop . ' confirmed your order and will start preparing it.']],
            OrderStatus::PICKED_UP->value => ['tone' => 'info', 'label' => 'Order shipped', 'title' => 'Your order is on its way.',
                'paragraphs' => ['A courier picked up your parcel from ' . $shop . '. It is heading to the sorting hub near you.']],
            OrderStatus::OUT_FOR_DELIVERY->value => ['tone' => 'info', 'label' => 'Out for delivery',
                'title' => $rider ? $rider . ' is bringing your parcel today.' : 'Your parcel arrives today.',
                'paragraphs' => array_values(array_filter([
                    ($rider ? $rider . ', your rider, is' : 'A courier is') . ' bringing your parcel to you now. Keep your phone nearby.',
                    $order->payment_method === 'cod' ? 'Please prepare ' . $this->peso($order->total) . ' in cash.' : null,
                ]))],
            OrderStatus::DELIVERED->value => ['tone' => 'success', 'label' => 'Delivered', 'title' => 'Your parcel was delivered.',
                'paragraphs' => [
                    'Your order from ' . $shop . ' was delivered. Please check it and confirm receipt in your orders.',
                    'If something is wrong, you can request a return from the same page.',
                ], 'actionLabel' => 'Confirm receipt'],
            OrderStatus::DELIVERY_FAILED->value => ['tone' => 'warning', 'label' => 'Delivery attempt failed', 'title' => 'We could not deliver your parcel.',
                'paragraphs' => ['The courier could not complete the delivery. The hub will try again or contact you.']],
            OrderStatus::RETURNED->value => ['tone' => 'warning', 'label' => 'Parcel returned', 'title' => 'Your parcel was returned to the shop.',
                'paragraphs' => ['After the delivery attempts, your parcel was returned to ' . $shop . '. Contact the shop if you still want the item.']],
            OrderStatus::CANCELLED->value => ['tone' => 'danger', 'label' => 'Order cancelled', 'title' => 'Your order was cancelled.',
                'paragraphs' => ['Order ' . $order->order_number . ' from ' . $shop . ' was cancelled.']],
            default => null,
        };

        if ($buyerNotice && $order->buyer) {
            $this->send($order->buyer, $buyerNotice['label'] . ': ' . $order->order_number, 'order_' . strtolower($to), $buyerNotice + [
                'details' => $orderDetails,
            ] + $buyerLink + $buyerFooter);
        }

        $seller = $order->items->first()?->seller;
        $sellerLink = ['actionUrl' => $this->url('/seller/orders'), 'actionLabel' => 'Open order'];
        $sellerFooter = ['footer' => 'You received this email because of an order at your Loved-IT shop.'];
        $sellerNotice = match ($to) {
            OrderStatus::DELIVERED->value => ['tone' => 'success', 'label' => 'Order delivered', 'title' => 'Your order reached the buyer.',
                'paragraphs' => ['Order ' . $order->order_number . ' was delivered. It completes when the buyer confirms receipt, or automatically after a few days.']],
            OrderStatus::COMPLETED->value => ['tone' => 'success', 'label' => 'Order completed', 'title' => 'Order complete. Earnings on the way.',
                'paragraphs' => ['Order ' . $order->order_number . ' is complete. Your earnings are held in escrow for a few days, then become available to withdraw.']],
            OrderStatus::CANCELLED->value => ['tone' => 'danger', 'label' => 'Order cancelled', 'title' => 'An order was cancelled.',
                'paragraphs' => ['Order ' . $order->order_number . ' was cancelled. Do not ship it.']],
            default => null,
        };

        if ($sellerNotice && $seller) {
            $this->send($seller, $sellerNotice['label'] . ': ' . $order->order_number, 'seller_order_' . strtolower($to), $sellerNotice + [
                'details' => $orderDetails,
            ] + $sellerLink + $sellerFooter);
        }
    }

    public function gcashPaymentConfirmed(Order $order): void
    {
        $order->loadMissing('buyer');
        $this->send($order->buyer, 'Payment received for ' . $order->order_number, 'payment_confirmed', [
            'tone' => 'success',
            'label' => 'Payment confirmed',
            'title' => 'We received your payment.',
            'paragraphs' => ['The shop confirmed your GCash payment. Your order is now being prepared.'],
            'details' => ['Order' => $order->order_number, 'Amount' => $this->peso($order->total), 'Reference' => (string) ($order->payment_reference ?? '—')],
            'actionUrl' => $this->url('/settings/orders'),
            'actionLabel' => 'View your order',
            'footer' => 'You received this email because you placed an order on Loved-IT.',
        ]);
    }

    public function gcashPaymentRejected(Order $order, string $reason): void
    {
        $order->loadMissing('buyer');
        $this->send($order->buyer, 'Action needed: payment for ' . $order->order_number, 'payment_rejected', [
            'tone' => 'danger',
            'label' => 'Payment not accepted',
            'title' => 'Please check your payment.',
            'paragraphs' => ['The shop could not verify your GCash payment for this order. Upload a clear receipt or contact the shop.'],
            'highlight' => ['title' => 'Reason from the shop', 'body' => $reason],
            'details' => ['Order' => $order->order_number, 'Amount' => $this->peso($order->total), 'Reference' => (string) ($order->payment_reference ?? '—')],
            'actionUrl' => $this->url('/settings/orders'),
            'actionLabel' => 'Fix payment',
            'footer' => 'You received this email because you placed an order on Loved-IT.',
        ]);
    }

    // ── Returns ──────────────────────────────────────────────────────────────

    public function returnRequested(Order $order, string $reason): void
    {
        $order->loadMissing(['items.seller', 'buyer']);
        $seller = $order->items->first()?->seller;
        $this->send($seller, 'Return requested for ' . $order->order_number, 'return_requested', [
            'tone' => 'warning',
            'label' => 'Return requested',
            'title' => 'A buyer asked for a return.',
            'paragraphs' => ['The buyer of order ' . $order->order_number . ' requested a return. Review the request and accept or reject it.'],
            'highlight' => ['title' => 'Buyer\'s reason', 'body' => $reason],
            'details' => ['Order' => $order->order_number, 'Buyer' => trim(($order->buyer?->first_name ?? '') . ' ' . ($order->buyer?->last_name ?? '')), 'Order total' => $this->peso($order->total)],
            'actionUrl' => $this->url('/seller/orders'),
            'actionLabel' => 'Review return',
            'footer' => 'You received this email because of an order at your Loved-IT shop.',
        ]);
    }

    /** @param 'accepted'|'rejected'|'partial' $outcome */
    public function returnResolved(Order $order, string $outcome, ?string $reason = null, ?float $partialAmount = null): void
    {
        $order->loadMissing('buyer');
        [$tone, $label, $title, $line] = match ($outcome) {
            'accepted' => ['success', 'Return accepted', 'Your return was accepted.',
                'The shop accepted your return request for order ' . $order->order_number . '. Follow the instructions in your orders to send the item back.'],
            'partial' => ['info', 'Partial refund offered', 'The shop offered a partial refund.',
                'The shop offered a partial refund of ' . $this->peso($partialAmount) . ' for order ' . $order->order_number . '. Loved-IT will mediate the request.'],
            default => ['danger', 'Return declined', 'Your return was declined.',
                'The shop declined your return request for order ' . $order->order_number . '. Loved-IT will review the case.'],
        };

        $this->send($order->buyer, $label . ': ' . $order->order_number, 'return_' . $outcome, array_filter([
            'tone' => $tone,
            'label' => $label,
            'title' => $title,
            'paragraphs' => [$line],
            'highlight' => ($outcome !== 'accepted' && $reason) ? ['title' => 'Note from the shop', 'body' => $reason] : null,
            'details' => ['Order' => $order->order_number],
            'actionUrl' => $this->url('/settings/returns'),
            'actionLabel' => 'View returns',
            'footer' => 'You received this email because you requested a return on Loved-IT.',
        ]));
    }

    // ── Payouts ──────────────────────────────────────────────────────────────

    public function earningsReleased(User $seller, float $amount, int $itemCount): void
    {
        $this->send($seller, 'Earnings available: ' . $this->peso($amount), 'earnings_released', [
            'tone' => 'success',
            'label' => 'Earnings released',
            'title' => $this->peso($amount) . ' is ready to withdraw.',
            'paragraphs' => ['The escrow hold ended for ' . $itemCount . ' sold ' . ($itemCount === 1 ? 'item' : 'items') . '. The amount is now in your available balance.'],
            'details' => ['Released' => $this->peso($amount), 'Items' => (string) $itemCount],
            'actionUrl' => $this->url('/seller/earnings'),
            'actionLabel' => 'Request a payout',
            'footer' => 'You received this email because you sell on Loved-IT.',
        ]);
    }

    public function payoutUpdated(PayoutRequest $payout, string $state, ?string $reason = null): void
    {
        $payout->loadMissing('seller');
        $copy = [
            'processing' => ['info', 'Payout sent', 'Your payout is on its way.', 'We sent ' . $this->peso($payout->amount) . ' to your GCash. It usually arrives within minutes.'],
            'completed'  => ['success', 'Payout completed', 'Your payout is complete.', $this->peso($payout->amount) . ' was transferred to your GCash.'],
            'rejected'   => ['danger', 'Payout not processed', 'We could not process your payout.', 'Your payout request was not processed. The amount was returned to your available balance.'],
        ][$state] ?? null;
        if (! $copy) {
            return;
        }
        [$tone, $label, $title, $line] = $copy;

        $this->send($payout->seller, $label . ': ' . $this->peso($payout->amount), 'payout_' . $state, array_filter([
            'tone' => $tone,
            'label' => $label,
            'title' => $title,
            'paragraphs' => [$line],
            'highlight' => ($state === 'rejected' && $reason) ? ['title' => 'Reason', 'body' => $reason] : null,
            'details' => array_filter([
                'Reference' => $payout->reference_code,
                'Amount' => $this->peso($payout->amount),
                'GCash' => trim(($payout->gcash_name ?? '') . ' ' . ($payout->gcash_number ? '· ' . $payout->gcash_number : '')),
            ]),
            'actionUrl' => $this->url('/seller/payouts'),
            'actionLabel' => 'View payouts',
            'footer' => 'You received this email because you requested a payout on Loved-IT.',
        ]));
    }

    // ── Plumbing ─────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $notice */
    /** The seller emails a seller can turn off, by type, and their NotificationPreferences category. */
    private const SELLER_PREFERENCES = [
        'seller_new_order'  => 'new_order',
        'seller_order_'     => 'order_updates',
        'return_requested'  => 'returns',
        'stock_low'         => 'low_stock',
        'review_new'        => 'new_review',
        'earnings_released' => 'payouts',
        'payout_'           => 'payouts',
        'product_'          => 'listings',
    ];

    private static function preferenceFor(string $kind): ?string
    {
        foreach (self::SELLER_PREFERENCES as $prefix => $category) {
            if ($kind === $prefix || (str_ends_with($prefix, '_') && str_starts_with($kind, $prefix))) {
                return $category;
            }
        }

        return null;
    }

    private function send(?User $to, string $subject, string $kind, array $notice): void
    {
        if (self::$muted || ! $to || ! $to->email) {
            return;
        }
        // A seller who turned this kind of email off in their notification settings does not get it.
        $category = self::preferenceFor($kind);
        if ($category && ! NotificationPreferences::allows($to, $category, 'email')) {
            return;
        }

        try {
            Mail::to($to->email)->queue(new NoticeMail($subject, $notice + ['recipientName' => $to->first_name ?: 'there'], $kind));
        } catch (\Throwable $e) {
            Log::warning("Could not queue the {$kind} email.", ['user_id' => $to->id, 'error' => $e->getMessage()]);
        }
    }

    /** Sends right away instead of queueing; a failure is logged and swallowed like a queued notice. */
    private function sendNow(string $email, ?string $name, string $subject, string $kind, array $notice): void
    {
        if (self::$muted || $email === '') {
            return;
        }

        try {
            Mail::to($email)->send(new NoticeMail($subject, $notice + ['recipientName' => $name ?: 'there'], $kind));
        } catch (\Throwable $e) {
            Log::warning("Could not send the {$kind} email.", ['email' => $email, 'error' => $e->getMessage()]);
        }
    }

    private function url(string $path): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/') . $path;
    }

    private function peso(float|int|string|null $amount): string
    {
        return '₱' . number_format((float) $amount, 2);
    }

    /** @return array{name: string, meta: string, amount: string} */
    private function itemRow($item, ?string $shop = null): array
    {
        $meta = array_filter([$item->variant_label && $item->variant_label !== 'Default' ? $item->variant_label : null, 'Qty ' . $item->quantity, $shop]);

        return ['name' => (string) $item->product_name, 'meta' => implode(' · ', $meta), 'amount' => $this->peso($item->subtotal)];
    }

    private function address(Order $order): string
    {
        return trim(implode(', ', array_filter([$order->shipping_address, $order->shipping_barangay, $order->shipping_city, $order->shipping_province])))
            ?: '—';
    }

    /** @return array<string, string> */
    private function productDetails(Product $product): array
    {
        return array_filter([
            'Product' => $product->name,
            'Product ID' => '#' . $product->id,
            'Base price' => $this->peso($product->base_price),
        ]);
    }
}
