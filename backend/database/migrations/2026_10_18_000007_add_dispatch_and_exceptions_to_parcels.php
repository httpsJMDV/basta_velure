<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Courier operations (Logistics and Rider workbooks, A10, A13, A14, A24, A32, A34):
 *  - job offers: a pickup is offered to the nearest eligible rider for 60 seconds, then the next one; after three
 *    declines or expiries it waits in the company's Unassigned queue (dispatch_state, dispatch_offers);
 *  - delivery proof: a 6-digit delivery OTP shown to the buyer once the parcel is out for delivery, locked for
 *    15 minutes after 5 wrong entries, and the COD amount the rider confirmed;
 *  - Return to Sender: the rider taking the parcel back to the seller, and the seller confirming it arrived;
 *  - exceptions: Lost, or Damaged with a photo, with the reason;
 *  - the parcel's weight and delivery zone, for the waybill and the hub's sorting;
 *  - riders' COD remittances to their company, confirmed only by the company.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parcels', function (Blueprint $table) {
            $table->decimal('weight_kg', 8, 3)->nullable()->after('cod_amount');
            $table->string('shipping_zone', 60)->nullable()->after('weight_kg');
            $table->string('dispatch_state', 20)->nullable()->after('pickup_rider_id');
            $table->unsignedTinyInteger('dispatch_attempts')->default(0)->after('dispatch_state');
            $table->text('delivery_otp')->nullable()->after('out_for_delivery_at');
            $table->unsignedTinyInteger('delivery_otp_attempts')->default(0)->after('delivery_otp');
            $table->timestamp('delivery_otp_locked_until')->nullable()->after('delivery_otp_attempts');
            $table->decimal('cod_collected_amount', 10, 2)->nullable()->after('cod_collected_at');
            $table->foreignId('rts_rider_id')->nullable()->after('assigned_rider_id')->constrained('riders')->nullOnDelete();
            $table->timestamp('rts_at')->nullable()->after('returned_at');
            $table->timestamp('rts_assigned_at')->nullable()->after('rts_at');
            $table->timestamp('seller_return_confirmed_at')->nullable()->after('rts_assigned_at');
            $table->string('exception_type', 20)->nullable()->after('return_note');
            $table->text('exception_reason')->nullable()->after('exception_type');
            $table->string('exception_photo_path', 255)->nullable()->after('exception_reason');
            $table->timestamp('exception_at')->nullable()->after('exception_photo_path');

            $table->index(['status', 'dispatch_state']);
        });

        Schema::create('dispatch_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parcel_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rider_id')->constrained()->cascadeOnDelete();
            // offered, accepted, declined, expired or cancelled
            $table->string('status', 20)->default('offered');
            $table->decimal('distance_km', 8, 2)->nullable();
            $table->timestamp('offered_at');
            $table->timestamp('expires_at');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->index(['rider_id', 'status']);
            $table->index(['parcel_id', 'status']);
        });

        Schema::create('cod_remittances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rider_id')->constrained()->cascadeOnDelete();
            $table->foreignId('logistics_company_id')->nullable()->constrained('logistics_companies')->nullOnDelete();
            $table->decimal('amount', 12, 2);
            // What the rider still had to remit when they submitted (for the shortfall check)
            $table->decimal('balance_at_submission', 12, 2)->default(0);
            // pending or confirmed
            $table->string('status', 20)->default('pending');
            $table->string('reference', 40)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('submitted_at');
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->string('idempotency_key', 64)->nullable()->unique();
            $table->timestamps();

            $table->index(['logistics_company_id', 'status']);
            $table->index(['rider_id', 'submitted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cod_remittances');
        Schema::dropIfExists('dispatch_offers');

        Schema::table('parcels', function (Blueprint $table) {
            $table->dropIndex(['status', 'dispatch_state']);
            $table->dropForeign(['rts_rider_id']);
            $table->dropColumn([
                'weight_kg', 'shipping_zone', 'dispatch_state', 'dispatch_attempts', 'delivery_otp', 'delivery_otp_attempts',
                'delivery_otp_locked_until', 'cod_collected_amount', 'rts_rider_id', 'rts_at', 'rts_assigned_at',
                'seller_return_confirmed_at', 'exception_type', 'exception_reason', 'exception_photo_path', 'exception_at',
            ]);
        });
    }
};
