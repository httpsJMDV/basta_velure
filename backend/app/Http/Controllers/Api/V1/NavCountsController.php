<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CodRemittance;
use App\Models\Conversation;
use App\Models\Dispute;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\PayoutRequest;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Refund;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use App\Services\Courier\HubRouter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The numbers on each portal's sidebar: how much is waiting on this account, item by item. Counts only (one light
 * request a minute per open portal), and each one uses the same rule as the list it points to, so the badge and the
 * page agree. Unread chat counts stay with their own endpoints, which the portals already poll.
 *
 * Contract: docs/api/nav-counts.md
 */
class NavCountsController extends Controller
{
    /** Return requests and disputes Loved-IT has to decide (AdminDisputeController::NEEDS_DECISION). */
    private const DISPUTES_TO_DECIDE = ['escalated', 'open', 'in_progress'];

    /** GET /admin/nav-counts */
    public function admin(): JsonResponse
    {
        $refundsToCheck = Refund::where('status', Refund::STATUS_NOT_RECEIVED)
            ->orWhere(fn ($q) => $q->where('status', Refund::STATUS_AWAITING_SHOP)->where('send_by', '<', now()))
            ->count();

        return response()->json(['data' => [
            'seller_applications'  => SellerProfile::where('application_status', 'pending')->count(),
            'buyer_applications'   => User::where('buyer_application_status', 'pending')->count(),
            'courier_applications' => LogisticsCompany::where('status', LogisticsCompany::STATUS_PENDING)->count(),
            'hub_applications'     => SortingCenter::where('status', SortingCenter::STATUS_PENDING)->count(),
            'products'             => Product::where('status', 'pending_review')->count(),
            'payments'             => Order::where('payment_method', 'gcash')->where('payment_status', 'pending_verification')->count()
                + PayoutRequest::where('status', 'pending')->count(),
            'disputes'             => Dispute::whereIn('status', self::DISPUTES_TO_DECIDE)->count() + $refundsToCheck,
            'messages'             => (int) Conversation::sum('admin_unread'),
        ]]);
    }

    /** GET /seller/nav-counts */
    public function seller(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $orders = fn (array $statuses) => Order::whereHas('items', fn ($q) => $q->where('seller_id', $sellerId))
            ->whereIn('status', $statuses)->count();

        $lowStockProducts = ProductVariant::lowStockFor($sellerId)
            ->whereHas('product', fn ($q) => $q->where('status', 'active'))
            ->distinct('product_id')->count('product_id');

        return response()->json(['data' => [
            // SellerOrderController::TABS "new", and the part of "to ship" that is still the shop's job.
            'orders_new'        => $orders(['PLACED']),
            'orders_to_prepare' => $orders(['CONFIRMED', 'PREPARING']),
            // Return requests the shop has 3 days to answer, and refunds the shop has to send.
            'returns_to_answer' => Dispute::where('seller_id', $sellerId)->where('status', 'pending')->count(),
            'refunds_to_send'   => Refund::where('seller_id', $sellerId)->where('status', Refund::STATUS_AWAITING_SHOP)->count(),
            'products_rejected' => Product::where('seller_id', $sellerId)->where('status', 'rejected')->count(),
            'products_low_stock' => $lowStockProducts,
            // ConversationController::unreadCount for a seller.
            'messages'          => (int) Conversation::where('seller_id', $sellerId)
                ->whereIn('type', ['buyer_seller', 'seller_admin', Conversation::TYPE_RIDER_SELLER])
                ->sum('seller_unread'),
        ]]);
    }

    /** GET /hub/nav-counts */
    public function hub(Request $request): JsonResponse
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;
        $parcels = fn () => Parcel::where('sorting_center_id', $hub->id);

        return response()->json(['data' => [
            // HubParcelIntakeController::expected
            'intake'     => $parcels()->expectedAtHub()->count(),
            // The Sorting page: parcels to sort here, and parcels to send on to another hub.
            'sorting'    => $parcels()->waitingToSort()->count() + (HubRouter::ready() ? $parcels()->waitingToSend()->count() : 0),
            // HubDispatchController::sortedParcels
            'dispatch'   => $parcels()->where('status', Parcel::STATUS_SORTED)
                ->whereNotNull('destination_barangay_code')->where('destination_barangay_code', '!=', '')->count(),
            // The Deliveries page: failed deliveries to triage, and return pickups that still need a rider.
            'deliveries' => $parcels()->where('status', Parcel::STATUS_DELIVERY_FAILED)->count()
                + ReturnPickup::where('sorting_center_id', $hub->id)->where('status', ReturnPickup::STATUS_REQUESTED)->count(),
            // HubRiderController::index counts.pending
            'riders'     => Rider::where('sorting_center_id', $hub->id)->carriesParcels()->where('status', Rider::STATUS_PENDING)->count(),
        ]]);
    }

    /** GET /logistics/nav-counts */
    public function logistics(Request $request): JsonResponse
    {
        /** @var LogisticsCompany $company */
        $company = $request->attributes->get('logistics_company');
        $parcels = fn () => LogisticsCompany::constrain(Parcel::query(), $company->id);
        $riders = fn () => LogisticsRiderController::companyRiders($company);

        return response()->json(['data' => [
            'hubs'      => LogisticsCompany::constrain(SortingCenter::query(), $company->id)->where('status', SortingCenter::STATUS_PENDING)->count(),
            // LogisticsRiderController::index summary (truck drivers included, the Riders page reviews them too):
            // applications, plus riders whose papers wait for a check.
            'riders'    => $riders()->where(fn ($q) => $q
                ->where('status', Rider::STATUS_PENDING)
                ->orWhere('needs_reverification', true))->count(),
            // Finished truck trips the company has not paid yet (TruckTrip::unpaid).
            'trucks'    => TruckTrip::unpaid()->whereIn('driver_id', $riders()->where('duty', Rider::DUTY_TRUCK)->select('id'))->count(),
            // LogisticsDispatchController::index counts.unassigned
            'dispatch'  => $parcels()->where('status', Parcel::STATUS_READY_FOR_PICKUP)->whereNull('pickup_rider_id')
                ->where(fn ($q) => $q->whereNull('dispatch_state')->orWhere('dispatch_state', Parcel::DISPATCH_UNASSIGNED))->count(),
            'parcels'   => $parcels()->where('status', Parcel::STATUS_DELIVERY_FAILED)->count(),
            // Return to sender with no rider yet, and return pickups waiting for a rider.
            'returns'   => $parcels()->where('status', Parcel::STATUS_RETURN_TO_SENDER)->whereNull('rts_rider_id')->count()
                + LogisticsCompany::constrain(ReturnPickup::query(), $company->id)->where('status', ReturnPickup::STATUS_REQUESTED)->count(),
            // Rider remittances only the company can confirm.
            'cod'       => CodRemittance::where('logistics_company_id', $company->id)->where('status', CodRemittance::STATUS_PENDING)->count(),
        ]]);
    }

    /** GET /rider/nav-counts */
    public function rider(Request $request): JsonResponse
    {
        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();

        if ($rider->isTruckDriver()) {
            return response()->json(['data' => [
                'pickups'    => 0,
                'deliveries' => 0,
                'trips'      => TruckTrip::where('driver_id', $rider->id)->where('status', TruckTrip::STATUS_ON_THE_WAY)->count(),
            ]]);
        }

        // RiderPickupController::index meta: open requests in the rider's areas, ones they took, ones to drop at the hub.
        $codes = $rider->areaAssignments()->where('is_active', true)->get()
            ->flatMap(fn ($a) => $a->coverage_barangays ?? [])
            ->map(fn ($code) => trim((string) $code))->filter()->unique()->values()->all();
        $sellerGroups = fn ($query) => (int) $query->distinct('seller_id')->count('seller_id');

        $pickups = ($codes ? $sellerGroups(Parcel::availableForRider($rider, $codes)) : 0)
            + $sellerGroups(Parcel::where('pickup_rider_id', $rider->id)->where('status', Parcel::STATUS_READY_FOR_PICKUP))
            + $sellerGroups(Parcel::where('pickup_rider_id', $rider->id)->where('status', Parcel::STATUS_PICKED_UP));

        return response()->json(['data' => [
            'pickups'    => $pickups,
            // RiderDeliveryController::index counts, and the return pickups on the same page.
            'deliveries' => Parcel::where('assigned_rider_id', $rider->id)
                ->whereIn('status', [Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY])->count()
                + ReturnPickup::where('rider_id', $rider->id)->whereIn('status', [ReturnPickup::STATUS_ASSIGNED, ReturnPickup::STATUS_COLLECTED])->count(),
            'trips'      => 0,
        ]]);
    }
}
