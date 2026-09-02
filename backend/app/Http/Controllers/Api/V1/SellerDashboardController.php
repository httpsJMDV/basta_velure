<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SellerDashboardController extends Controller
{
    /** GET /seller/dashboard/stats */
    public function stats(Request $request): JsonResponse
    {
        $sellerId  = $request->user()->id;
        $today     = Carbon::today();
        $yesterday = Carbon::yesterday();

        $todaySales = (float) OrderItem::where('seller_id', $sellerId)
            ->whereDate('created_at', $today)
            ->sum('subtotal');

        $yesterdaySales = (float) OrderItem::where('seller_id', $sellerId)
            ->whereDate('created_at', $yesterday)
            ->sum('subtotal');

        $ordersToPack = OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereIn('status', ['pending', 'paid', 'processing']))
            ->distinct('order_id')
            ->count('order_id');

        $totalProducts = Product::where('seller_id', $sellerId)
            ->where('status', '!=', 'archived')
            ->count();

        $lowStockCount = ProductVariant::whereHas('product', fn ($q) => $q->where('seller_id', $sellerId))
            ->where('stock_quantity', '<=', 5)
            ->count();

        $totalRevenue = (float) OrderItem::where('seller_id', $sellerId)->sum('subtotal');

        return response()->json([
            'data' => [
                'today_sales'     => $todaySales,
                'yesterday_sales' => $yesterdaySales,
                'orders_to_pack'  => $ordersToPack,
                'total_products'  => $totalProducts,
                'low_stock_count' => $lowStockCount,
                'balance'         => [
                    'pending'        => 0.0,
                    'available'      => $totalRevenue,
                    'total_paid_out' => 0.0,
                ],
            ],
        ]);
    }

    /** GET /seller/dashboard/chart?range=7d */
    public function chart(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $range    = $request->query('range', '7d');
        $days     = $range === '14d' ? 14 : 7;

        $points = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date    = Carbon::today()->subDays($i);
            $dateStr = $date->toDateString();

            $sales = (float) OrderItem::where('seller_id', $sellerId)
                ->whereDate('created_at', $dateStr)
                ->sum('subtotal');

            $orders = OrderItem::where('seller_id', $sellerId)
                ->whereDate('created_at', $dateStr)
                ->distinct('order_id')
                ->count('order_id');

            $points[] = [
                'date'   => $date->format('M j'),
                'sales'  => $sales,
                'orders' => $orders,
            ];
        }

        return response()->json(['data' => $points]);
    }

    /** GET /seller/dashboard/attention */
    public function attention(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $items    = [];

        // 1. Pending / new orders
        $newOrders = OrderItem::with('order')
            ->where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereIn('status', ['pending', 'paid']))
            ->latest()
            ->take(3)
            ->get();

        foreach ($newOrders as $item) {
            $items[] = [
                'type'  => 'new_order',
                'id'    => $item->order_id,
                'label' => 'New Order #' . ($item->order->order_number ?? $item->order_id),
                'sub'   => 'Awaiting fulfillment',
                'link'  => '/seller/orders',
            ];
        }

        // 2. Low stock variants
        $lowStockVariants = ProductVariant::with('product')
            ->whereHas('product', fn ($q) => $q->where('seller_id', $sellerId)->where('status', 'active'))
            ->where('stock_quantity', '<=', 5)
            ->take(3)
            ->get();

        foreach ($lowStockVariants as $variant) {
            $items[] = [
                'type'  => 'low_stock',
                'id'    => $variant->id,
                'label' => 'Low Stock: ' . ($variant->product->name ?? 'Product') . ' (' . $variant->label . ')',
                'sub'   => $variant->stock_quantity . ' items remaining',
                'link'  => '/seller/products',
            ];
        }

        // 3. Rejected products
        $rejectedProducts = Product::where('seller_id', $sellerId)
            ->where('status', 'rejected')
            ->take(3)
            ->get();

        foreach ($rejectedProducts as $prod) {
            $items[] = [
                'type'  => 'rejected_product',
                'id'    => $prod->id,
                'label' => 'Product Rejected: ' . $prod->name,
                'sub'   => 'Needs review / corrections',
                'link'  => '/seller/products',
            ];
        }

        return response()->json(['data' => $items]);
    }

    /** GET /seller/dashboard/top-products */
    public function topProducts(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;

        $products = Product::with(['images', 'variants'])
            ->where('seller_id', $sellerId)
            ->where('status', 'active')
            ->latest()
            ->take(5)
            ->get();

        $top = $products->map(function ($product) {
            $primary = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
            $thumbnailUrl = $primary ? Storage::disk('public')->url($primary->path) : null;

            return [
                'id'            => $product->id,
                'name'          => $product->name,
                'thumbnail_url' => $thumbnailUrl,
                'units_sold'    => 0,
                'revenue'       => (float) $product->base_price,
            ];
        });

        return response()->json(['data' => $top]);
    }
}
