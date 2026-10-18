<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One 6-digit code sent by email. Only its hash is stored. A code is usable while it is not consumed, not superseded by
 * a newer code for the same purpose, not expired and not out of attempts.
 *
 * @property int $id
 * @property int $user_id
 * @property string $purpose
 * @property string|null $target
 * @property string $code_hash
 * @property \Carbon\Carbon $expires_at
 * @property \Carbon\Carbon|null $consumed_at
 * @property \Carbon\Carbon|null $superseded_at
 * @property int $attempts
 */
class EmailOtp extends Model
{
    public const PURPOSE_REGISTER = 'register';
    public const PURPOSE_EMAIL_CHANGE = 'email_change';
    public const PURPOSE_PHONE_CHANGE = 'phone_change';

    protected $fillable = ['user_id', 'purpose', 'target', 'code_hash', 'expires_at', 'consumed_at', 'superseded_at', 'attempts'];

    protected $hidden = ['code_hash'];

    protected function casts(): array
    {
        return [
            'expires_at'    => 'datetime',
            'consumed_at'   => 'datetime',
            'superseded_at' => 'datetime',
            'attempts'      => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
