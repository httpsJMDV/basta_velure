<?php

use App\Http\Controllers\Api\V1\AdminController;
use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\AdminDisputeController;
use App\Http\Controllers\Api\V1\AdminOrderController;
use App\Http\Controllers\Api\V1\AdminPaymentController;
use App\Http\Controllers\Api\V1\AdminReviewController;
use App\Http\Controllers\Api\V1\AdminSellerApplicationController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\GoogleAuthController;
use App\Http\Controllers\Api\V1\PasswordController;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

// Rate limiters
RateLimiter::for('auth', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(5)->by($request->ip()));
RateLimiter::for('upload', fn (Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute(10)->by($request->ip()));

Route::prefix('v1')->group(function () {

    // Public auth routes
    Route::middleware('throttle:auth')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'registerBuyer']);
        Route::post('/auth/register/seller', [AuthController::class, 'registerSeller']);
        Route::post('/auth/login', [AuthController::class, 'login']);
        Route::post('/auth/forgot-password', [PasswordController::class, 'forgot']);
        Route::post('/auth/reset-password', [PasswordController::class, 'reset']);
        Route::post('/auth/google', GoogleAuthController::class);
    });

    // Authenticated routes
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::patch('/auth/profile', [AuthController::class, 'updateProfile']);
        Route::post('/auth/avatar', [AuthController::class, 'uploadAvatar'])->middleware('throttle:upload');

        // Addresses
        Route::get('/addresses', [AddressController::class, 'index']);
        Route::post('/addresses', [AddressController::class, 'store']);
        Route::patch('/addresses/{address}', [AddressController::class, 'update']);
        Route::delete('/addresses/{address}', [AddressController::class, 'destroy']);
        Route::patch('/addresses/{address}/default', [AddressController::class, 'setDefault']);

        // Admin-only routes
        Route::middleware('role:admin')->prefix('admin')->group(function () {
            // Dashboard stats
            Route::get('/stats', [AdminController::class, 'stats']);
            Route::get('/dashboard-feed', [AdminController::class, 'dashboardFeed']);

            // Users
            Route::get('/users', [AdminController::class, 'users']);
            Route::patch('/users/{user}/suspend',    [AdminController::class, 'suspend']);
            Route::patch('/users/{user}/reactivate', [AdminController::class, 'reactivate']);

            // Activity log
            Route::get('/activity-log', [AdminController::class, 'activityLog']);

            // Seller applications
            Route::get('/seller-applications', [AdminSellerApplicationController::class, 'index']);
            Route::get('/seller-applications/{sellerProfile}', [AdminSellerApplicationController::class, 'show']);
            Route::post('/seller-applications/{sellerProfile}/approve', [AdminSellerApplicationController::class, 'approve']);
            Route::post('/seller-applications/{sellerProfile}/reject', [AdminSellerApplicationController::class, 'reject']);
            Route::get('/seller-applications/{sellerProfile}/id-image', [AdminSellerApplicationController::class, 'idImage'])
                ->name('admin.seller-applications.id-image');

            // Orders
            Route::get('/orders', [AdminOrderController::class, 'index']);
            Route::get('/orders/stats', [AdminOrderController::class, 'stats']);
            Route::get('/orders/{order}', [AdminOrderController::class, 'show']);
            Route::patch('/orders/{order}/status', [AdminOrderController::class, 'updateStatus']);

            // Payments
            Route::get('/payments', [AdminPaymentController::class, 'index']);
            Route::get('/payments/stats', [AdminPaymentController::class, 'stats']);
            Route::patch('/payments/{payment}/mark-paid', [AdminPaymentController::class, 'markPaid']);

            // Disputes
            Route::get('/disputes', [AdminDisputeController::class, 'index']);
            Route::get('/disputes/stats', [AdminDisputeController::class, 'stats']);
            Route::get('/disputes/{dispute}', [AdminDisputeController::class, 'show']);
            Route::patch('/disputes/{dispute}/resolve', [AdminDisputeController::class, 'resolve']);

            // Reviews
            Route::get('/reviews', [AdminReviewController::class, 'index']);
            Route::get('/reviews/stats', [AdminReviewController::class, 'stats']);
            Route::patch('/reviews/{review}/moderate', [AdminReviewController::class, 'moderate']);

            // Conversations (admin side)
            Route::get('/conversations', [ConversationController::class, 'index']);
            Route::get('/conversations/seller/{seller}', [ConversationController::class, 'openForSeller']);
            Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages']);
            Route::post('/conversations/{conversation}/messages', [ConversationController::class, 'send']);
        });

        // Seller: own conversation with admin
        Route::middleware('role:seller')->group(function () {
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
