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
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\GoogleAuthController;
use App\Http\Controllers\Api\V1\PasswordController;
use App\Http\Controllers\Api\V1\SellerProductController;
use App\Http\Controllers\Api\V1\SellerDashboardController;
use App\Http\Controllers\Api\V1\SellerOrderController;
use App\Http\Controllers\Api\V1\SellerEarningsController;
use App\Http\Controllers\Api\V1\PublicProductController;
use App\Http\Controllers\Api\V1\PublicShopController;
use App\Http\Controllers\Api\V1\AdminPlatformSettingController;
use App\Http\Controllers\Api\V1\AdminReportController;
use App\Http\Controllers\Api\V1\SellerReportController;
use App\Http\Controllers\Api\V1\SellerShopProfileController;
use App\Http\Controllers\Api\V1\WishlistController;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

// Rate limiters
RateLimiter::for('auth', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(5)->by($request->ip()));
RateLimiter::for('upload', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(10)->by($request->ip()));

// Broadcast auth for Sanctum (/api/broadcasting/auth)
\Illuminate\Support\Facades\Broadcast::routes(['middleware' => ['auth:sanctum']]);

Route::prefix('v1')->group(function () {

    // Public product catalog (no auth required)
    Route::get('/products',                    [PublicProductController::class, 'index']);
    Route::get('/products/{product}',          [PublicProductController::class, 'show']);
    Route::get('/products/{product}/reviews',  [PublicProductController::class, 'reviews']);
    Route::get('/products/{product}/related',  [PublicProductController::class, 'related']);

    // Public shop profile & reviews (no auth required)
    Route::get('/shops/{shop}',                [PublicShopController::class, 'show']);
    Route::get('/shops/{shop}/reviews',        [PublicShopController::class, 'reviews']);
    Route::get('/stores/{shop}',               [PublicShopController::class, 'show']);
    // Public platform policies
    Route::get('/platform/policies',           [AdminPlatformSettingController::class, 'getPublicPlatformPolicies']);

    // Public auth routes
    Route::middleware('throttle:auth')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'registerBuyer']);
        Route::post('/auth/login', [AuthController::class, 'login']);
        Route::post('/auth/forgot-password', [PasswordController::class, 'forgot']);
        Route::post('/auth/reset-password', [PasswordController::class, 'reset']);
        Route::post('/auth/google', GoogleAuthController::class);
    });

    // Authenticated routes
    Route::middleware('auth:sanctum')->group(function () {
        // Broadcast authentication for Echo / WebSockets
        \Illuminate\Support\Facades\Broadcast::routes();

        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);
        Route::post('/auth/avatar', [AuthController::class, 'uploadAvatar'])->middleware('throttle:upload');
        Route::post('/auth/complete-profile', [AuthController::class, 'completeProfile'])->middleware('throttle:upload');
        Route::post('/auth/apply-seller', [AuthController::class, 'applyAsSeller'])->middleware('throttle:upload');

        // Wishlist
        Route::get('/wishlist', [WishlistController::class, 'index']);
        Route::post('/wishlist/toggle', [WishlistController::class, 'toggle']);

        // Store follows
        Route::get('/store-follows', [WishlistController::class, 'followedStores']);
        Route::post('/store-follows/toggle', [WishlistController::class, 'toggleFollow']);

        // Addresses
        Route::get('/addresses', [AddressController::class, 'index']);
        Route::post('/addresses', [AddressController::class, 'store']);
        Route::patch('/addresses/{address}', [AddressController::class, 'update']);
        Route::delete('/addresses/{address}', [AddressController::class, 'destroy']);
        Route::patch('/addresses/{address}/default', [AddressController::class, 'setDefault']);

        // Buyer checkout & orders
        Route::post('/checkout/place-order', [BuyerOrderController::class, 'placeOrder'])->middleware('throttle:upload');
        Route::get('/buyer/orders', [BuyerOrderController::class, 'index']);
        Route::get('/buyer/orders/{order}', [BuyerOrderController::class, 'show']);
        Route::post('/buyer/orders/{order}/request-return', [BuyerOrderController::class, 'requestReturn']);

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

            // Orders
            Route::get('/orders', [AdminOrderController::class, 'index']);
            Route::get('/orders/stats', [AdminOrderController::class, 'stats']);
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
            Route::get('/reviews', [AdminReviewController::class, 'index']);
            Route::get('/reviews/stats', [AdminReviewController::class, 'stats']);
            Route::patch('/reviews/{review}/moderate', [AdminReviewController::class, 'moderate']);

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

        // Seller: own conversation with admin (any approved seller, regardless of role value)
        Route::middleware('approved_seller')->group(function () {
            // Seller dashboard
            Route::get('/seller/dashboard/stats', [SellerDashboardController::class, 'stats']);
            Route::get('/seller/dashboard/chart', [SellerDashboardController::class, 'chart']);
            Route::get('/seller/dashboard/attention', [SellerDashboardController::class, 'attention']);
            Route::get('/seller/dashboard/top-products', [SellerDashboardController::class, 'topProducts']);

            // Seller products
            Route::get('/seller/products', [SellerProductController::class, 'index']);
            Route::post('/seller/products', [SellerProductController::class, 'store'])->middleware('throttle:upload');
            Route::post('/seller/products/description-image', [SellerProductController::class, 'uploadDescriptionImage'])->middleware('throttle:upload');
            Route::get('/seller/products/{product}', [SellerProductController::class, 'show']);
            Route::post('/seller/products/{product}', [SellerProductController::class, 'update'])->middleware('throttle:upload');
            Route::patch('/seller/products/{product}/stock', [SellerProductController::class, 'updateStock']);
            Route::patch('/seller/products/{product}/price', [SellerProductController::class, 'updatePrice']);
            Route::patch('/seller/products/{product}/status', [SellerProductController::class, 'updateStatus']);
            Route::delete('/seller/products/{product}', [SellerProductController::class, 'destroy']);

            // Seller shop profile
            Route::get('/seller/shop-profile', [SellerShopProfileController::class, 'show']);
            Route::post('/seller/shop-profile', [SellerShopProfileController::class, 'update'])->middleware('throttle:upload');

            // Seller orders & verification
            Route::get('/seller/orders', [SellerOrderController::class, 'index']);
            Route::get('/seller/orders/{order}', [SellerOrderController::class, 'show']);
            Route::post('/seller/orders/{order}/confirm-payment', [SellerOrderController::class, 'confirmPayment']);
            Route::post('/seller/orders/{order}/reject-payment', [SellerOrderController::class, 'rejectPayment']);
            Route::post('/seller/orders/{order}/respond-return', [SellerOrderController::class, 'respondReturn']);
            Route::patch('/seller/orders/{order}/status', [SellerOrderController::class, 'updateStatus']);

            // Seller earnings & payouts
            Route::get('/seller/earnings', [SellerEarningsController::class, 'summary']);
            Route::get('/seller/earnings/orders', [SellerEarningsController::class, 'orderBreakdown']);
            Route::get('/seller/payouts', [SellerEarningsController::class, 'payouts']);
            Route::post('/seller/payouts/request', [SellerEarningsController::class, 'requestPayout']);

            // Seller sales reports
            Route::get('/seller/reports/summary', [SellerReportController::class, 'summary']);
            Route::get('/seller/reports/revenue-chart', [SellerReportController::class, 'revenueChart']);
            Route::get('/seller/reports/payment-methods', [SellerReportController::class, 'paymentMethods']);
            Route::get('/seller/reports/top-products', [SellerReportController::class, 'topProducts']);

            Route::get('/my-conversation', [ConversationController::class, 'mine']);
            Route::get('/my-conversation/messages', function (\Illuminate\Http\Request $req) {
                $conv = \App\Models\Conversation::firstOrCreate(
                    ['seller_id' => $req->user()->id],
                    ['last_message_at' => now()]
                );
                return app(ConversationController::class)->messages($req, $conv);
            });
            Route::post('/my-conversation/messages', function (\Illuminate\Http\Request $req) {
                $conv = \App\Models\Conversation::firstOrCreate(
                    ['seller_id' => $req->user()->id],
                    ['last_message_at' => now()]
                );
                return app(ConversationController::class)->send($req, $conv);
            });
        });
    });
});
