<?php

use App\Http\Controllers\Api\V1\AdminController;
use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\AdminDisputeController;
use App\Http\Controllers\Api\V1\AdminOrderController;
use App\Http\Controllers\Api\V1\AdminPaymentController;
use App\Http\Controllers\Api\V1\AdminProductController;
use App\Http\Controllers\Api\V1\AdminReviewController;
use App\Http\Controllers\Api\V1\AdminCategoryController;
use App\Http\Controllers\Api\V1\AdminBuyerApplicationController;
use App\Http\Controllers\Api\V1\AdminSellerApplicationController;
use App\Http\Controllers\Api\V1\AdminPayoutController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BuyerOrderController;
use App\Http\Controllers\Api\V1\BuyerReviewController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\GoogleAuthController;
use App\Http\Controllers\Api\V1\PasswordController;
use App\Http\Controllers\Api\V1\SellerProductController;
use App\Http\Controllers\Api\V1\SellerDashboardController;
use App\Http\Controllers\Api\V1\SellerOrderController;
use App\Http\Controllers\Api\V1\SellerEarningsController;
use App\Http\Controllers\Api\V1\PublicCategoryController;
use App\Http\Controllers\Api\V1\SiteFeedbackController;
use App\Http\Controllers\Api\V1\PublicProductController;
use App\Http\Controllers\Api\V1\PublicShopController;
use App\Http\Controllers\Api\V1\AdminPlatformSettingController;
use App\Http\Controllers\Api\V1\AdminReportController;
use App\Http\Controllers\Api\V1\SellerReportController;
use App\Http\Controllers\Api\V1\SellerShopProfileController;
use App\Http\Controllers\Api\V1\WishlistController;
use App\Http\Controllers\Api\V1\SortingCenterRegistrationController;
use App\Http\Controllers\Api\V1\AdminSortingCenterApplicationController;
use App\Http\Controllers\Api\V1\SortingCenterDashboardController;
use App\Http\Controllers\Api\V1\PublicSortingCenterController;
use App\Http\Controllers\Api\V1\RiderRegistrationController;
use App\Http\Controllers\Api\V1\HubChatController;
use App\Http\Controllers\Api\V1\RiderChatController;
use App\Http\Controllers\Api\V1\HubDeliveryController;
use App\Http\Controllers\Api\V1\HubDispatchController;
use App\Http\Controllers\Api\V1\HubReportController;
use App\Http\Controllers\Api\V1\HubParcelIntakeController;
use App\Http\Controllers\Api\V1\HubRiderController;
use App\Http\Controllers\Api\V1\HubSortingController;
use App\Http\Controllers\Api\V1\HubRiderAreaAssignmentController;
use App\Http\Controllers\Api\V1\RiderController;
use App\Http\Controllers\Api\V1\DeliveryProofController;
use App\Http\Controllers\Api\V1\ParcelTrackingController;
use App\Http\Controllers\Api\V1\HubEarningsController;
use App\Http\Controllers\Api\V1\RiderLocationController;
use App\Http\Controllers\Api\V1\RiderDeliveryController;
use App\Http\Controllers\Api\V1\RiderEarningsController;
use App\Http\Controllers\Api\V1\RiderHistoryController;
use App\Http\Controllers\Api\V1\RiderPickupController;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

// Rate limiters
RateLimiter::for('auth', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(10)->by($request->ip()));
// Sign-up forms and their email codes: generous enough for a family behind one router, still capped per address.
RateLimiter::for('register', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(30)->by($request->ip()));
RateLimiter::for('upload', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(10)->by($request->ip()));

// Broadcast auth for Sanctum (/api/broadcasting/auth)
\Illuminate\Support\Facades\Broadcast::routes(['middleware' => ['auth:sanctum']]);

Route::prefix('v1')->group(function () {

    // Public product catalog (no auth required)
    Route::get('/products',                    [PublicProductController::class, 'index']);
    Route::get('/products/{product}',          [PublicProductController::class, 'show']);
    Route::get('/products/{product}/reviews',  [PublicProductController::class, 'reviews']);
    // Claimable vouchers (B7): a shop's, a product's and Loved-IT's. Code-only vouchers are never listed.
    Route::get('/products/{product}/vouchers', [\App\Http\Controllers\Api\V1\BuyerVoucherController::class, 'forProduct']);
    Route::get('/shops/{seller}/vouchers',     [\App\Http\Controllers\Api\V1\BuyerVoucherController::class, 'forShop'])->whereNumber('seller');
    Route::get('/vouchers/platform',           [\App\Http\Controllers\Api\V1\BuyerVoucherController::class, 'platform']);
    // The sandbox gateway's server-to-server callback, signed with config('payments.sandbox_secret').
    Route::post('/payments/sandbox/callback',  [\App\Http\Controllers\Api\V1\SandboxPaymentController::class, 'callback']);
    Route::get('/products/{product}/related',  [PublicProductController::class, 'related']);
    Route::get('/categories',                  [PublicCategoryController::class, 'index']);

    // Public shop profile & reviews (no auth required)
    Route::get('/shops',                       [PublicShopController::class, 'featured']);
    // How each shop in a cart gets paid (GCash details only for signed-in buyers) and its free delivery minimum
    Route::get('/checkout/shops',              [\App\Http\Controllers\Api\V1\ShopPaymentController::class, 'shops']);
    Route::get('/shops/{shop}',                [PublicShopController::class, 'show']);
    Route::get('/shops/{shop}/reviews',        [PublicShopController::class, 'reviews']);
    Route::get('/stores/{shop}',               [PublicShopController::class, 'show']);
    // Public platform policies
    Route::get('/platform/policies',           [AdminPlatformSettingController::class, 'getPublicPlatformPolicies']);
    // Public logistics hubs
    Route::get('/logistics/hubs',              [PublicSortingCenterController::class, 'index']);
    // Approved courier companies: the choices at checkout and on the hub application
    Route::get('/logistics/couriers',          [PublicSortingCenterController::class, 'couriers']);

    // Public auth routes
    Route::middleware('throttle:register')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'registerBuyer']);
        // A visitor applies as a seller or a courier company in one form (account + application), then verifies the email
        Route::post('/auth/register-seller', [AuthController::class, 'applyAsSeller']);
        Route::post('/auth/register-courier', [\App\Http\Controllers\Api\V1\CourierCompanyApplicationController::class, 'store']);
        Route::post('/auth/verify-email', [AuthController::class, 'verifyEmail']);
        Route::post('/auth/resend-verification', [AuthController::class, 'resendVerification']);
        // A rider added by a courier company sets their password from the emailed link (works once, 24 hours)
        Route::get('/auth/rider-activation', [\App\Http\Controllers\Api\V1\RiderActivationController::class, 'show']);
        Route::post('/auth/rider-activation', [\App\Http\Controllers\Api\V1\RiderActivationController::class, 'activate']);
    });
    Route::middleware('throttle:auth')->group(function () {
        Route::post('/auth/login', [AuthController::class, 'login']);
        Route::post('/auth/forgot-password', [PasswordController::class, 'forgot']);
        Route::post('/auth/reset-password', [PasswordController::class, 'reset']);
        Route::post('/auth/google', GoogleAuthController::class);
    });

    // Authenticated routes
    Route::middleware('auth:sanctum')->group(function () {
        // Broadcast authentication for Echo / WebSockets
        \Illuminate\Support\Facades\Broadcast::routes();

        // Feedback about the site (the storefront's Feedback button)
        Route::post('/feedback', [SiteFeedbackController::class, 'store'])->middleware('throttle:10,1');

        // Delivery proof photo (Feature 2.7): rider, hub, seller, buyer and admin only; authorization is in the controller
        Route::get('/parcels/{tracking}/delivery-proof', [DeliveryProofController::class, 'show']);
        // Track package: timeline, route places and the courier's live position (buyer, seller, hub, rider, admin)
        Route::get('/parcels/{tracking}/tracking', [ParcelTrackingController::class, 'show']);

        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);
        // Account security: each change is confirmed (current password, or a code sent by email)
        Route::post('/auth/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');
        Route::post('/auth/email-change', [AuthController::class, 'requestEmailChange'])->middleware('throttle:10,1');
        Route::post('/auth/email-change/confirm', [AuthController::class, 'confirmEmailChange'])->middleware('throttle:20,1');
        Route::post('/auth/phone-change', [AuthController::class, 'requestPhoneChange'])->middleware('throttle:10,1');
        Route::post('/auth/phone-change/confirm', [AuthController::class, 'confirmPhoneChange'])->middleware('throttle:20,1');
        Route::post('/auth/avatar', [AuthController::class, 'uploadAvatar'])->middleware('throttle:upload');
        Route::post('/auth/complete-profile', [AuthController::class, 'completeProfile'])->middleware('throttle:upload');
        Route::post('/auth/apply-seller', [AuthController::class, 'applyAsSeller'])->middleware('throttle:upload');
        // Logistics hubs and couriers apply from their buyer account, like sellers (no separate account or email)
        Route::post('/auth/apply-hub', [SortingCenterRegistrationController::class, 'register'])->middleware('throttle:upload');
        Route::post('/auth/apply-rider', [RiderRegistrationController::class, 'register'])->middleware('throttle:upload');
        Route::post('/auth/apply-courier', [\App\Http\Controllers\Api\V1\CourierCompanyApplicationController::class, 'store'])->middleware('throttle:upload');

        // Courier company portal (the company's own team)
        Route::middleware('logistics_member')->prefix('logistics')->group(function () {
            $portal = \App\Http\Controllers\Api\V1\LogisticsPortalController::class;
            Route::get('/me', [$portal, 'me']);
            Route::get('/dashboard', [$portal, 'dashboard']);
            Route::get('/network/hubs', [$portal, 'hubsIndex']);
            Route::get('/network/hubs/{hub}', [$portal, 'hubShow'])->whereNumber('hub');
            Route::get('/network/hubs/{hub}/documents/{doc}', [$portal, 'hubDocument'])->whereNumber('hub')->whereIn('doc', ['permit', 'id', 'id-back']);
            Route::post('/network/hubs/{hub}/approve', [$portal, 'approveHub'])->whereNumber('hub');
            Route::post('/network/hubs/{hub}/reject', [$portal, 'rejectHub'])->whereNumber('hub');
            Route::post('/network/hubs/{hub}/suspend', [$portal, 'suspendHub'])->whereNumber('hub');
            Route::post('/network/hubs/{hub}/reactivate', [$portal, 'reactivateHub'])->whereNumber('hub');
            // Riders: the company adds them, verifies, suspends and reactivates them (every action is audited)
            $riders = \App\Http\Controllers\Api\V1\LogisticsRiderController::class;
            Route::get('/riders', [$riders, 'index']);
            Route::post('/riders', [$riders, 'store'])->middleware('throttle:upload');
            // Delivery zones and shipping rates (L8), every change audit-logged
            $shipping = \App\Http\Controllers\Api\V1\LogisticsShippingController::class;
            Route::get('/shipping', [$shipping, 'index']);
            Route::get('/shipping/audit', [$shipping, 'audit']);
            Route::post('/shipping/zones', [$shipping, 'storeZone']);
            Route::patch('/shipping/zones/{zone}', [$shipping, 'updateZone'])->whereNumber('zone');
            Route::delete('/shipping/zones/{zone}', [$shipping, 'destroyZone'])->whereNumber('zone');
            Route::put('/shipping/rates', [$shipping, 'upsertRate']);
            Route::delete('/shipping/rates/{rate}', [$shipping, 'destroyRate'])->whereNumber('rate');
            Route::get('/riders/{rider}', [$riders, 'show'])->whereNumber('rider');
            Route::get('/riders/{rider}/documents/{doc}', [$riders, 'document'])->whereNumber('rider')->whereIn('doc', ['license', 'or-cr']);
            Route::post('/riders/{rider}/resend-activation', [$riders, 'resendActivation'])->whereNumber('rider')->middleware('throttle:10,1');
            Route::post('/riders/{rider}/approve', [$riders, 'approve'])->whereNumber('rider');
            Route::post('/riders/{rider}/reject', [$riders, 'reject'])->whereNumber('rider');
            Route::post('/riders/{rider}/suspend', [$riders, 'suspend'])->whereNumber('rider');
            Route::post('/riders/{rider}/reactivate', [$riders, 'reactivate'])->whereNumber('rider');
            Route::get('/parcels', [$portal, 'parcels']);
            Route::get('/reports', [$portal, 'reports']);
            // Money: the weekly statement with each shop, paying riders and hubs, and the GCash shops pay
            Route::get('/settlements', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'index']);
            Route::post('/settlements', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'pay']);
            Route::post('/settlements/{settlement}/confirm', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'confirm'])->whereNumber('settlement');
            Route::get('/payouts', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'payouts']);
            Route::post('/payouts/riders/{rider}', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'payRider'])->whereNumber('rider');
            Route::post('/payouts/hubs/{hub}', [\App\Http\Controllers\Api\V1\LogisticsSettlementController::class, 'payHub'])->whereNumber('hub');
            Route::get('/gcash', [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'courier']);
            Route::patch('/gcash', [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'updateCourier']);
        });

        // In-app notifications (the bell): every order and shipment status change, job offers, decisions
        $notifications = \App\Http\Controllers\Api\V1\NotificationController::class;
        Route::get('/notifications', [$notifications, 'index']);
        Route::get('/notifications/unread-count', [$notifications, 'unreadCount']);
        Route::post('/notifications/read-all', [$notifications, 'markAllRead']);
        Route::post('/notifications/{id}/read', [$notifications, 'markRead']);

        // Wishlist
        Route::get('/wishlist', [WishlistController::class, 'index']);
        Route::post('/wishlist/toggle', [WishlistController::class, 'toggle']);

        // Store follows
        Route::get('/store-follows', [WishlistController::class, 'followedStores']);
        Route::post('/store-follows/toggle', [WishlistController::class, 'toggleFollow']);

        // Addresses
        Route::get('/addresses', [AddressController::class, 'index']);
        Route::post('/addresses', [AddressController::class, 'store']);
        Route::match(['patch', 'put'], '/addresses/{address}', [AddressController::class, 'update']);
        Route::delete('/addresses/{address}', [AddressController::class, 'destroy']);
        Route::patch('/addresses/{address}/default', [AddressController::class, 'setDefault']);

        // Cart on the server (B6): only the buyer's own lines
        $cart = \App\Http\Controllers\Api\V1\CartController::class;
        Route::get('/cart', [$cart, 'index']);
        Route::post('/cart/items', [$cart, 'store']);
        Route::patch('/cart/items/{line}', [$cart, 'update'])->whereNumber('line');
        Route::delete('/cart/items/{line}', [$cart, 'destroy'])->whereNumber('line');
        Route::post('/cart/select', [$cart, 'select']);
        Route::post('/cart/merge', [$cart, 'merge']);

        // Vouchers in the wallet (B7)
        Route::get('/buyer/vouchers', [\App\Http\Controllers\Api\V1\BuyerVoucherController::class, 'wallet']);
        Route::post('/buyer/vouchers/claim', [\App\Http\Controllers\Api\V1\BuyerVoucherController::class, 'claim']);

        // Buyer checkout & orders (B8, B9)
        Route::post('/checkout/quote', [\App\Http\Controllers\Api\V1\CheckoutController::class, 'quote']);
        Route::post('/checkout/place-order', [\App\Http\Controllers\Api\V1\CheckoutController::class, 'place'])->middleware('throttle:upload');
        Route::get('/payments/sessions/{token}', [\App\Http\Controllers\Api\V1\SandboxPaymentController::class, 'show']);
        Route::post('/payments/sessions/{token}/complete', [\App\Http\Controllers\Api\V1\SandboxPaymentController::class, 'complete']);
        // Product reviews: once per product per delivered order, with up to five photos
        Route::get('/buyer/reviews', [BuyerReviewController::class, 'index']);
        Route::get('/buyer/reviews/pending', [BuyerReviewController::class, 'pending']);
        Route::post('/buyer/reviews', [BuyerReviewController::class, 'store'])->middleware('throttle:upload');
        Route::patch('/buyer/reviews/{review}', [BuyerReviewController::class, 'update']);
        Route::get('/buyer/orders', [BuyerOrderController::class, 'index']);
        Route::get('/buyer/orders/{order}', [BuyerOrderController::class, 'show']);
        Route::post('/buyer/orders/{order}/request-return', [BuyerOrderController::class, 'requestReturn'])->middleware('throttle:upload');
        Route::post('/buyer/orders/{order}/escalate-return', [BuyerOrderController::class, 'escalateReturn']);
        Route::post('/buyer/orders/{order}/cancel', [BuyerOrderController::class, 'cancel']);
        Route::post('/buyer/orders/{order}/pay-again', [BuyerOrderController::class, 'payAgain']);
        // Feature 2.8: only buyers (other roles get 403); another buyer's order is a 404 in the controller
        Route::post('/buyer/orders/{order}/confirm-receipt', [BuyerOrderController::class, 'confirmReceipt'])->middleware('role:buyer');

        // Unified Messaging & Chat System
        Route::get('/conversations', [ConversationController::class, 'index']);
        Route::get('/conversations/unread-count', [ConversationController::class, 'unreadCount']);
        Route::post('/conversations/start', [ConversationController::class, 'start']);
        Route::get('/conversations/{conversation}', [ConversationController::class, 'show']);
        Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages']);
        Route::post('/conversations/{conversation}/messages', [ConversationController::class, 'send']);
        Route::get('/conversations/{conversation}/attachable-products', [ConversationController::class, 'attachableProducts']);
        Route::get('/conversations/{conversation}/attachable-orders', [ConversationController::class, 'attachableOrders']);
        Route::patch('/conversations/{conversation}/status', [ConversationController::class, 'updateStatus']);

        // Admin-only routes
        Route::middleware('role:admin')->prefix('admin')->group(function () {
            // Platform and shipping vouchers (Loved-IT funded, A8)
            $vouchers = \App\Http\Controllers\Api\V1\VoucherManagementController::class;
            Route::get('/vouchers', [$vouchers, 'index']);
            Route::post('/vouchers', [$vouchers, 'store']);
            Route::patch('/vouchers/{voucher}', [$vouchers, 'update'])->whereNumber('voucher');
            Route::post('/vouchers/{voucher}/end', [$vouchers, 'end'])->whereNumber('voucher');

            // Dashboard stats
            Route::get('/stats', [AdminController::class, 'stats']);
            Route::get('/dashboard-feed', [AdminController::class, 'dashboardFeed']);

            // Users & Contacts Search
            Route::get('/users', [AdminController::class, 'users']);
            Route::get('/contacts/search', [AdminController::class, 'searchContacts']);
            Route::patch('/users/{user}/suspend',    [AdminController::class, 'suspend']);
            Route::patch('/users/{user}/reactivate', [AdminController::class, 'reactivate']);

            // Activity log
            Route::get('/activity-log', [AdminController::class, 'activityLog']);

            // Buyer applications
            Route::get('/buyer-applications', [AdminBuyerApplicationController::class, 'index']);
            Route::post('/buyer-applications/{user}/approve', [AdminBuyerApplicationController::class, 'approve']);
            Route::post('/buyer-applications/{user}/reject',  [AdminBuyerApplicationController::class, 'reject']);
            Route::get('/buyer-applications/{user}/id-image', [AdminBuyerApplicationController::class, 'idImage']);
            Route::get('/buyer-applications/{user}/id-image-back', [AdminBuyerApplicationController::class, 'idImageBack']);

            // Seller applications
            Route::get('/seller-applications', [AdminSellerApplicationController::class, 'index']);
            Route::get('/seller-applications/{sellerProfile}', [AdminSellerApplicationController::class, 'show']);
            Route::post('/seller-applications/{sellerProfile}/approve', [AdminSellerApplicationController::class, 'approve']);
            Route::post('/seller-applications/{sellerProfile}/reject', [AdminSellerApplicationController::class, 'reject']);
            Route::get('/seller-applications/{sellerProfile}/id-image', [AdminSellerApplicationController::class, 'idImage'])
                ->name('admin.seller-applications.id-image');
            Route::get('/seller-applications/{sellerProfile}/id-image-back', [AdminSellerApplicationController::class, 'idImageBack'])
                ->name('admin.seller-applications.id-image-back');
            Route::get('/seller-applications/{sellerProfile}/selfie', [AdminSellerApplicationController::class, 'selfieWithId'])
                ->name('admin.seller-applications.selfie');
            Route::get('/seller-applications/{sellerProfile}/business-permit', [AdminSellerApplicationController::class, 'businessPermit'])
                ->name('admin.seller-applications.business-permit');
            Route::get('/seller-applications/{sellerProfile}/dti-sec-registration', [AdminSellerApplicationController::class, 'dtiSecRegistration'])
                ->name('admin.seller-applications.dti-sec-registration');
            Route::get('/seller-applications/{sellerProfile}/fda-lto', [AdminSellerApplicationController::class, 'fdaLto'])
                ->name('admin.seller-applications.fda-lto');
            Route::get('/seller-applications/{sellerProfile}/bir-2303', [AdminSellerApplicationController::class, 'bir2303'])
                ->name('admin.seller-applications.bir-2303');

            // Courier companies (J&T, Flash, ...): applications and oversight
            $couriers = \App\Http\Controllers\Api\V1\AdminCourierApplicationController::class;
            Route::get('/courier-applications', [$couriers, 'index']);
            Route::get('/courier-applications/{company}', [$couriers, 'show'])->whereNumber('company');
            Route::post('/courier-applications/{company}/approve', [$couriers, 'approve'])->whereNumber('company');
            Route::post('/courier-applications/{company}/reject', [$couriers, 'reject'])->whereNumber('company');
            Route::post('/courier-applications/{company}/suspend', [$couriers, 'suspend'])->whereNumber('company');
            Route::post('/courier-applications/{company}/reactivate', [$couriers, 'reactivate'])->whereNumber('company');
            Route::get('/courier-applications/{company}/permit', [$couriers, 'permit'])->whereNumber('company')
                ->name('admin.courier-applications.permit');
            Route::get('/courier-applications/{company}/documents/{doc}', [$couriers, 'document'])->whereNumber('company')
                ->whereIn('doc', ['sec', 'bir', 'rep-id'])->name('admin.courier-applications.document');

            // Sorting Center (Logistics Hub) applications
            Route::get('/sorting-center-applications', [AdminSortingCenterApplicationController::class, 'index']);
            Route::get('/sorting-center-applications/{sortingCenter}', [AdminSortingCenterApplicationController::class, 'show']);
            Route::post('/sorting-center-applications/{sortingCenter}/approve', [AdminSortingCenterApplicationController::class, 'approve']);
            Route::post('/sorting-center-applications/{sortingCenter}/reject', [AdminSortingCenterApplicationController::class, 'reject']);
            Route::get('/sorting-center-applications/{sortingCenter}/dti-permit', [AdminSortingCenterApplicationController::class, 'dtiPermit'])
                ->name('admin.sorting-center-applications.dti-permit');
            Route::get('/sorting-center-applications/{sortingCenter}/id-image', [AdminSortingCenterApplicationController::class, 'idImage'])
                ->name('admin.sorting-center-applications.id-image');
            Route::get('/sorting-center-applications/{sortingCenter}/id-image-back', [AdminSortingCenterApplicationController::class, 'idImageBack'])
                ->name('admin.sorting-center-applications.id-image-back');

            // Orders
            Route::get('/orders', [AdminOrderController::class, 'index']);
            Route::get('/orders/stats', [AdminOrderController::class, 'stats']);
            Route::get('/orders/summary', [AdminOrderController::class, 'summary']);
            Route::get('/orders/{order}', [AdminOrderController::class, 'show']);
            Route::patch('/orders/{order}/status', [AdminOrderController::class, 'updateStatus']);

            // Payments & Payouts (admin)
            Route::get('/payments', [AdminPaymentController::class, 'index']);
            Route::get('/payments/stats', [AdminPaymentController::class, 'stats']);
            Route::patch('/payments/{payment}/mark-paid', [AdminPaymentController::class, 'markPaid']);
            Route::get('/payouts', [AdminPayoutController::class, 'index']);
            Route::post('/payouts/{payout}/mark-sent', [AdminPayoutController::class, 'markSent']);
            Route::post('/payouts/{payout}/complete', [AdminPayoutController::class, 'complete']);
            Route::post('/payouts/{payout}/reject', [AdminPayoutController::class, 'reject']);

            // Reports & Analytics (admin)
            Route::get('/reports/summary', [AdminReportController::class, 'summary']);
            Route::get('/reports/revenue-chart', [AdminReportController::class, 'revenueChart']);
            Route::get('/reports/category-breakdown', [AdminReportController::class, 'categoryBreakdown']);
            Route::get('/reports/top-sellers', [AdminReportController::class, 'topSellers']);
            Route::get('/reports/payment-method-split', [AdminReportController::class, 'paymentMethodSplit']);

            // Platform Commission & Policy Settings (admin)
            Route::get('/settings/commission', [AdminPlatformSettingController::class, 'getCommissionSettings']);
            Route::post('/settings/commission', [AdminPlatformSettingController::class, 'updateCommissionSettings']);
            Route::get('/settings/return-policy', [AdminPlatformSettingController::class, 'getReturnPolicySettings']);
            Route::post('/settings/return-policy', [AdminPlatformSettingController::class, 'updateReturnPolicySettings']);
            // Commission shops pay on direct orders, and the GCash it goes to
            Route::get('/commission', [\App\Http\Controllers\Api\V1\AdminCommissionController::class, 'index']);
            Route::post('/commission/{payment}/confirm', [\App\Http\Controllers\Api\V1\AdminCommissionController::class, 'confirm'])->whereNumber('payment');
            Route::get('/settings/payments', [\App\Http\Controllers\Api\V1\AdminCommissionController::class, 'settings']);
            Route::put('/settings/payments', [\App\Http\Controllers\Api\V1\AdminCommissionController::class, 'updateSettings']);

            // Category Taxonomy Management (admin)
            Route::get('/categories', [AdminCategoryController::class, 'index']);
            Route::post('/categories', [AdminCategoryController::class, 'store']);
            Route::put('/categories/{category}', [AdminCategoryController::class, 'update']);
            Route::delete('/categories/{category}', [AdminCategoryController::class, 'destroy']);

            // Disputes
            Route::get('/disputes', [AdminDisputeController::class, 'index']);
            Route::get('/disputes/stats', [AdminDisputeController::class, 'stats']);
            Route::get('/disputes/{dispute}', [AdminDisputeController::class, 'show']);
            Route::patch('/disputes/{dispute}/resolve', [AdminDisputeController::class, 'resolve']);

            // Reviews
            // Reviews are read-only for the admin (honest feedback: no approve, hide or delete), grouped by shop.
            Route::get('/reviews', [AdminReviewController::class, 'index']);
            Route::get('/reviews/summary', [AdminReviewController::class, 'summary']);
            Route::get('/reviews/shops', [AdminReviewController::class, 'shops']);
            Route::get('/reviews/shops/{seller}', [AdminReviewController::class, 'shop']);
            Route::get('/feedback', [SiteFeedbackController::class, 'index']);
            Route::patch('/feedback/{feedback}', [SiteFeedbackController::class, 'update']);

            // Products (admin review)
            Route::get('/products', [AdminProductController::class, 'index']);
            Route::get('/products/stats', [AdminProductController::class, 'stats']);
            Route::get('/products/{product}', [AdminProductController::class, 'show']);
            Route::post('/products/{product}/approve', [AdminProductController::class, 'approve']);
            Route::post('/products/{product}/reject',  [AdminProductController::class, 'reject']);
            Route::post('/products/{product}/archive',     [AdminProductController::class, 'archive']);
            Route::post('/products/{product}/reactivate',  [AdminProductController::class, 'reactivate']);
            Route::get('/products/{product}/fda-lto',      [AdminProductController::class, 'fdaLto']);
            Route::get('/products/{product}/fda-cpr',      [AdminProductController::class, 'fdaCpr']);

            // Conversations (admin side)
            Route::get('/conversations', [ConversationController::class, 'index']);
            Route::get('/conversations/seller/{seller}', [ConversationController::class, 'openForSeller']);
            Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages']);
            Route::post('/conversations/{conversation}/messages', [ConversationController::class, 'send']);
        });

        // Seller products: a store waiting for approval can prepare drafts; only an approved store publishes (A18)
        Route::middleware('seller_applicant')->group(function () {
            Route::get('/seller/products', [SellerProductController::class, 'index']);
            Route::post('/seller/products', [SellerProductController::class, 'store'])->middleware('throttle:upload');
            Route::post('/seller/products/bulk', [SellerProductController::class, 'bulk']);
            Route::post('/seller/products/description-image', [SellerProductController::class, 'uploadDescriptionImage'])->middleware('throttle:upload');
            Route::get('/seller/products/{product}', [SellerProductController::class, 'show']);
            Route::post('/seller/products/{product}', [SellerProductController::class, 'update'])->middleware('throttle:upload');
            Route::post('/seller/products/{product}/duplicate', [SellerProductController::class, 'duplicate']);
            Route::patch('/seller/products/{product}/stock', [SellerProductController::class, 'updateStock']);
            Route::patch('/seller/products/{product}/price', [SellerProductController::class, 'updatePrice']);
            Route::patch('/seller/products/{product}/status', [SellerProductController::class, 'updateStatus']);
            Route::delete('/seller/products/{product}', [SellerProductController::class, 'destroy']);
        });

        // Flash sale reminders (buyers)
        Route::post('/flash-sales/{flash}/reminder', [\App\Http\Controllers\Api\V1\FlashSaleReminderController::class, 'store'])->whereNumber('flash');
        Route::delete('/flash-sales/{flash}/reminder', [\App\Http\Controllers\Api\V1\FlashSaleReminderController::class, 'destroy'])->whereNumber('flash');

        // Seller: own conversation with admin (any approved seller, regardless of role value)
        Route::middleware('approved_seller')->group(function () {
            // Seller dashboard
            Route::get('/seller/dashboard/stats', [SellerDashboardController::class, 'stats']);
            Route::get('/seller/dashboard/chart', [SellerDashboardController::class, 'chart']);
            Route::get('/seller/dashboard/attention', [SellerDashboardController::class, 'attention']);
            Route::get('/seller/dashboard/top-products', [SellerDashboardController::class, 'topProducts']);

            // Store categories, promotions and reviews (approved stores)
            $storeCats = \App\Http\Controllers\Api\V1\SellerStoreCategoryController::class;
            Route::get('/seller/store-categories', [$storeCats, 'index']);
            Route::post('/seller/store-categories', [$storeCats, 'store']);
            Route::post('/seller/store-categories/reorder', [$storeCats, 'reorder']);
            Route::patch('/seller/store-categories/{category}', [$storeCats, 'update'])->whereNumber('category');
            Route::get('/seller/store-categories/{category}/delete-preview', [$storeCats, 'deletePreview'])->whereNumber('category');
            Route::delete('/seller/store-categories/{category}', [$storeCats, 'destroy'])->whereNumber('category');

            $promos = \App\Http\Controllers\Api\V1\SellerPromotionController::class;
            Route::get('/seller/promotions', [$promos, 'index']);
            Route::post('/seller/promotions', [$promos, 'storePromotion']);
            Route::post('/seller/promotions/{promotion}/end', [$promos, 'endPromotion'])->whereNumber('promotion');
            Route::post('/seller/sales', [$promos, 'storeSale']);
            Route::patch('/seller/sales/{sale}', [$promos, 'updateSale'])->whereNumber('sale');
            Route::post('/seller/sales/{sale}/end', [$promos, 'endSale'])->whereNumber('sale');
            Route::post('/seller/flash-sales', [$promos, 'storeFlash']);
            Route::post('/seller/flash-sales/{flash}/end', [$promos, 'endFlash'])->whereNumber('flash');

            $sellerReviews = \App\Http\Controllers\Api\V1\SellerReviewController::class;
            Route::get('/seller/reviews', [$sellerReviews, 'index']);
            Route::post('/seller/reviews/{review}/reply', [$sellerReviews, 'reply'])->whereNumber('review');
            Route::patch('/seller/reviews/{review}/reply', [$sellerReviews, 'updateReply'])->whereNumber('review');

            // Seller shop profile
            Route::get('/seller/shop-profile', [SellerShopProfileController::class, 'show']);
            Route::post('/seller/shop-profile', [SellerShopProfileController::class, 'update'])->middleware('throttle:upload');

            // Seller orders & verification
            Route::get('/seller/orders', [SellerOrderController::class, 'index']);
            Route::get('/seller/orders/{order}', [SellerOrderController::class, 'show']);
            Route::get('/seller/orders/{order}/waybill', [SellerOrderController::class, 'waybill']);
            Route::post('/seller/orders/{order}/confirm-payment', [SellerOrderController::class, 'confirmPayment']);
            Route::post('/seller/orders/{order}/reject-payment', [SellerOrderController::class, 'rejectPayment']);
            Route::post('/seller/orders/{order}/respond-return', [SellerOrderController::class, 'respondReturn']);
            Route::post('/seller/orders/{order}/cancel', [SellerOrderController::class, 'cancel']);
            // Store vouchers (S9)
            $vouchers = \App\Http\Controllers\Api\V1\VoucherManagementController::class;
            Route::get('/seller/vouchers', [$vouchers, 'index']);
            Route::post('/seller/vouchers', [$vouchers, 'store']);
            Route::patch('/seller/vouchers/{voucher}', [$vouchers, 'update'])->whereNumber('voucher');
            Route::post('/seller/vouchers/{voucher}/end', [$vouchers, 'end'])->whereNumber('voucher');
            Route::patch('/seller/orders/{order}/status', [SellerOrderController::class, 'updateStatus']);

            // Seller earnings & payouts
            Route::get('/seller/earnings', [SellerEarningsController::class, 'summary']);
            Route::get('/seller/earnings/orders', [SellerEarningsController::class, 'orderBreakdown']);
            Route::get('/seller/payouts', [SellerEarningsController::class, 'payouts']);
            Route::post('/seller/payouts/request', [SellerEarningsController::class, 'requestPayout']);
            // Direct payments: the shop's GCash and free delivery, courier statements, commission
            Route::get('/seller/payment-settings', [\App\Http\Controllers\Api\V1\ShopPaymentController::class, 'show']);
            Route::post('/seller/payment-settings', [\App\Http\Controllers\Api\V1\ShopPaymentController::class, 'update'])->middleware('throttle:upload');
            Route::get('/seller/settlements', [\App\Http\Controllers\Api\V1\SellerSettlementController::class, 'index']);
            Route::post('/seller/settlements', [\App\Http\Controllers\Api\V1\SellerSettlementController::class, 'pay']);
            Route::post('/seller/settlements/{settlement}/confirm', [\App\Http\Controllers\Api\V1\SellerSettlementController::class, 'confirm'])->whereNumber('settlement');
            Route::get('/seller/commission', [\App\Http\Controllers\Api\V1\SellerSettlementController::class, 'commission']);
            Route::post('/seller/commission', [\App\Http\Controllers\Api\V1\SellerSettlementController::class, 'payCommission']);

            // Seller sales reports
            Route::get('/seller/reports/summary', [SellerReportController::class, 'summary']);
            Route::get('/seller/reports/revenue-chart', [SellerReportController::class, 'revenueChart']);
            Route::get('/seller/reports/payment-methods', [SellerReportController::class, 'paymentMethods']);
            Route::get('/seller/reports/top-products', [SellerReportController::class, 'topProducts']);

            Route::get('/my-conversation', [ConversationController::class, 'mine']);
            Route::get('/my-conversation/messages', function (\Illuminate\Http\Request $req) {
                $conv = \App\Models\Conversation::firstOrCreate(
                    ['seller_id' => $req->user()->id, 'type' => 'seller_admin'],
                    ['status' => 'open', 'subject' => 'Platform Support', 'last_message_at' => now()]
                );
                return app(ConversationController::class)->messages($req, $conv);
            });
            Route::post('/my-conversation/messages', function (\Illuminate\Http\Request $req) {
                $conv = \App\Models\Conversation::firstOrCreate(
                    ['seller_id' => $req->user()->id, 'type' => 'seller_admin'],
                    ['status' => 'open', 'subject' => 'Platform Support', 'last_message_at' => now()]
                );
                return app(ConversationController::class)->send($req, $conv);
            });
        });

        // Logistics / Sorting Center Hub (approved hubs only)
        Route::middleware('approved_sorting_center')->prefix('hub')->group(function () {
            Route::get('/dashboard/metrics', [SortingCenterDashboardController::class, 'metrics']);
            Route::get('/coverage-options',  [HubRiderController::class, 'coverageOptions']);
            Route::get('/gcash',  [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'hub']);
            Route::patch('/gcash', [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'updateHub']);

            // Parcel intake (Feature 1.6)
            Route::get('/parcels/{tracking}',          [HubParcelIntakeController::class, 'lookup']);
            Route::post('/parcels/{tracking}/receive', [HubParcelIntakeController::class, 'receive']);
            Route::get('/intake/expected',             [HubParcelIntakeController::class, 'expected']);
            Route::get('/intake/received-today',       [HubParcelIntakeController::class, 'receivedToday']);

            // Area sorting (Feature 1.7)
            Route::get('/sorting/groups',                          [HubSortingController::class, 'groups']);
            Route::get('/sorting/groups/{barangay_code}/parcels',  [HubSortingController::class, 'groupParcels']);
            Route::post('/sorting/sort',                           [HubSortingController::class, 'sort']);

            // Delivery monitoring and failure triage (Feature 1.9)
            Route::get('/deliveries/out',                               [HubDeliveryController::class, 'out']);
            Route::get('/deliveries/failed',                            [HubDeliveryController::class, 'failed']);
            Route::post('/deliveries/{tracking}/reschedule',            [HubDeliveryController::class, 'reschedule']);
            Route::post('/deliveries/{tracking}/return-to-seller',      [HubDeliveryController::class, 'returnToSeller']);

            // Dispatch (Feature 1.8)
            Route::get('/dispatch/batches',                              [HubDispatchController::class, 'batches']);
            Route::get('/dispatch/batches/{barangay_code}/parcels',      [HubDispatchController::class, 'batchParcels']);
            Route::get('/dispatch/batches/{barangay_code}/riders',       [HubDispatchController::class, 'batchRiders']);
            Route::post('/dispatch/assign',                              [HubDispatchController::class, 'assign']);
            Route::get('/dispatch/awaiting-pickup',                      [HubDispatchController::class, 'awaitingPickup']);

            // The hub's share of the delivery fee
            Route::get('/earnings', [HubEarningsController::class, 'summary']);

            // Hub reports (Feature 1.10)
            Route::get('/reports/summary', [HubReportController::class, 'summary']);
            Route::get('/reports/riders',  [HubReportController::class, 'riders']);
            Route::get('/reports/export',  [HubReportController::class, 'export']);

            // Rider delivery chat (Feature 2.10): riders start threads, the hub lists, reads and replies
            Route::get('/chat/threads',                              [HubChatController::class, 'index']);
            Route::get('/chat/threads/{conversation}',               [HubChatController::class, 'show']);
            Route::get('/chat/threads/{conversation}/messages',      [HubChatController::class, 'messages']);
            Route::post('/chat/threads/{conversation}/messages',     [HubChatController::class, 'send']);
            Route::post('/chat/threads/{conversation}/read',         [HubChatController::class, 'markRead']);

            // Hub rider vetting
            Route::get('/riders',                         [HubRiderController::class, 'index']);
            Route::get('/riders/{rider}',                 [HubRiderController::class, 'show']);
            Route::post('/riders/{rider}/approve',        [HubRiderController::class, 'approve']);
            Route::post('/riders/{rider}/disapprove',     [HubRiderController::class, 'disapprove']);
            Route::get('/riders/{rider}/or-cr',           [HubRiderController::class, 'orCrDocument']);
            Route::get('/riders/{rider}/license',         [HubRiderController::class, 'licenseDocument']);

            // Rider area assignments
            Route::get('/riders/{rider}/areas',           [HubRiderAreaAssignmentController::class, 'index']);
            Route::post('/riders/{rider}/areas',          [HubRiderAreaAssignmentController::class, 'store']);
            Route::put('/riders/{rider}/areas/{area}',    [HubRiderAreaAssignmentController::class, 'update']);
            Route::delete('/riders/{rider}/areas/{area}', [HubRiderAreaAssignmentController::class, 'destroy']);
        });

        // Rider / Courier (approved riders only)
        Route::middleware('approved_rider')->prefix('rider')->group(function () {
            Route::get('/me', [RiderController::class, 'me']);
            Route::get('/gcash', [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'rider']);
            Route::patch('/gcash', [\App\Http\Controllers\Api\V1\PayoutAccountController::class, 'updateRider']);

            // Pickups (Feature 2.4)
            Route::get('/pickups', [RiderPickupController::class, 'index']);
            Route::post('/pickups/sellers/{seller}/accept', [RiderPickupController::class, 'accept']);
            Route::post('/pickups/sellers/{seller}/decline', [RiderPickupController::class, 'decline']);
            Route::post('/pickups/sellers/{seller}/release', [RiderPickupController::class, 'release']);

            // Pickup execution (Feature 2.5)
            Route::post('/pickups/verify', [RiderPickupController::class, 'verify']);
            Route::post('/pickups/confirm', [RiderPickupController::class, 'confirm']);

            // Delivery console (Feature 2.6)
            Route::get('/deliveries', [RiderDeliveryController::class, 'index']);
            Route::post('/deliveries/start', [RiderDeliveryController::class, 'start']);

            // Earnings and delivery history (Feature 2.9)
            Route::get('/earnings/summary', [RiderEarningsController::class, 'summary']);
            Route::get('/earnings/deliveries', [RiderEarningsController::class, 'deliveries']);
            Route::get('/history', [RiderHistoryController::class, 'index']);

            // Delivery outcomes (Feature 2.7)
            Route::get('/deliveries/failure-reasons', [RiderDeliveryController::class, 'failureReasons']);
            Route::post('/deliveries/{tracking}/delivered', [RiderDeliveryController::class, 'delivered']);
            Route::post('/deliveries/{tracking}/failed', [RiderDeliveryController::class, 'failed']);

            // Delivery chat and vehicle (Feature 2.10). The seller and buyer use /conversations; the hub uses /hub/chat.
            Route::get('/chat/threads', [RiderChatController::class, 'index']);
            Route::get('/chat/unread', [RiderChatController::class, 'unread']);
            Route::post('/chat/parcels/{tracking}/threads', [RiderChatController::class, 'open']);
            Route::get('/chat/threads/{conversation}', [RiderChatController::class, 'show']);
            Route::get('/chat/threads/{conversation}/messages', [RiderChatController::class, 'messages']);
            Route::post('/chat/threads/{conversation}/messages', [RiderChatController::class, 'send']);
            Route::post('/chat/threads/{conversation}/read', [RiderChatController::class, 'markRead']);
            Route::post('/vehicle', [RiderController::class, 'updateVehicle'])->middleware('throttle:upload');
            Route::put('/vehicle', [RiderController::class, 'updateVehicle'])->middleware('throttle:upload');
            Route::post('/license', [RiderController::class, 'updateLicense'])->middleware('throttle:upload');
            Route::get('/documents/{doc}', [RiderController::class, 'document'])->whereIn('doc', ['license', 'or-cr']);

            // Live location: the rider's latest point, shown to the people tracking a parcel they carry
            Route::get('/location/status', [RiderLocationController::class, 'status']);
            Route::post('/location', [RiderLocationController::class, 'store'])->middleware('throttle:60,1');
        });
    });
});
