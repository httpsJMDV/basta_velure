<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminActivityLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'admin_id',
        'action',
        'target_type',
        'target_id',
        'description',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'meta'       => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /** One entry in the admin activity log. */
    public static function log(int $adminId, string $action, string $description, ?string $targetType = null, ?int $targetId = null, array $meta = []): self
    {
        return static::forceCreate([
            'admin_id' => $adminId, 'action' => $action, 'description' => $description,
            'target_type' => $targetType, 'target_id' => $targetId, 'meta' => $meta ?: null, 'created_at' => now(),
        ]);
    }
}
