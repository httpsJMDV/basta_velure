<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One entry of the operations audit log (A35). Entries are written once and never changed: the model refuses updates
 * and deletes, and no route edits them.
 *
 * @property int $id
 * @property int|null $actor_user_id
 * @property string|null $actor_role
 * @property int|null $logistics_company_id
 * @property string $action
 * @property string $subject_type
 * @property int|null $subject_id
 * @property array|null $old_value
 * @property array|null $new_value
 * @property string|null $reason
 * @property \Carbon\Carbon $created_at
 */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'actor_user_id', 'actor_role', 'logistics_company_id', 'action', 'subject_type', 'subject_id',
        'old_value', 'new_value', 'reason',
    ];

    protected function casts(): array
    {
        return [
            'old_value'  => 'array',
            'new_value'  => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('Audit log entries cannot be changed.'));
        static::deleting(fn () => throw new \LogicException('Audit log entries cannot be deleted.'));
    }

    /**
     * Writes one entry.
     *
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public static function record(
        ?User $actor,
        string $action,
        Model|string $subject,
        ?array $old = null,
        ?array $new = null,
        ?string $reason = null,
        ?int $companyId = null,
        ?string $actorRole = null,
    ): self {
        return static::create([
            'actor_user_id'        => $actor?->id,
            'actor_role'           => $actorRole ?? $actor?->role,
            'logistics_company_id' => $companyId,
            'action'               => $action,
            'subject_type'         => is_string($subject) ? $subject : class_basename($subject),
            'subject_id'           => is_string($subject) ? null : $subject->getKey(),
            'old_value'            => $old,
            'new_value'            => $new,
            'reason'               => $reason,
        ]);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
