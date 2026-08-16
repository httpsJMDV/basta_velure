<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    protected $fillable = ['seller_id', 'last_message_at', 'admin_unread', 'seller_unread'];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public function seller(): BelongsTo  { return $this->belongsTo(User::class, 'seller_id'); }
    public function messages(): HasMany  { return $this->hasMany(Message::class); }
    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }
}
