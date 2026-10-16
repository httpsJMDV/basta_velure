<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A person who runs a courier company's portal (the owner who applied, or staff). One company per account. */
class LogisticsCompanyMember extends Model
{
    protected $fillable = ['logistics_company_id', 'user_id', 'role'];

    public function company(): BelongsTo
    {
        return $this->belongsTo(LogisticsCompany::class, 'logistics_company_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
