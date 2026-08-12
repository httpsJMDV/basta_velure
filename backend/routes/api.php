<?php

use App\Http\Controllers\Api\V1\AdminController;
use App\Http\Controllers\Api\V1\AddressController;
use App\Http\Controllers\Api\V1\AdminSellerApplicationController;
use App\Http\Controllers\Api\V1\AuthController;
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
        });
    });
});
