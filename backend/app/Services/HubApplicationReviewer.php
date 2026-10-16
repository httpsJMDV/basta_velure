<?php

namespace App\Services;

use App\Mail\SortingCenterApplicationMail;
use App\Models\AdminActivityLog;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Decisions on a logistics hub, shared by the courier company's portal (the normal path: a courier vets its own hubs)
 * and the platform admin (oversight). Platform admin decisions are also written to the admin activity log.
 */
class HubApplicationReviewer
{
    public function approve(SortingCenter $hub, User $reviewer): void
    {
        abort_if($hub->status !== SortingCenter::STATUS_PENDING, 422, 'Only pending sorting center applications can be approved.');

        $owner = $hub->user;
        DB::transaction(function () use ($hub, $reviewer, $owner) {
            $hub->update([
                'status'           => SortingCenter::STATUS_APPROVED,
                'rejection_reason' => null,
                'reviewed_by'      => $reviewer->id,
                'reviewed_at'      => now(),
            ]);
            $owner?->update(['status' => 'active']);
            $this->log($reviewer, 'approve_sorting_center', $hub, "Approved sorting center application for hub \"{$hub->hub_name}\".");
        });

        $this->mail($owner, new SortingCenterApplicationMail($owner, 'approved', null, $hub), 'approval');
    }

    public function reject(SortingCenter $hub, User $reviewer, string $reason): void
    {
        abort_if($hub->status !== SortingCenter::STATUS_PENDING, 422, 'Only pending sorting center applications can be rejected.');

        $owner = $hub->user;
        DB::transaction(function () use ($hub, $reviewer, $reason) {
            $hub->update([
                'status'           => SortingCenter::STATUS_REJECTED,
                'rejection_reason' => $reason,
                'reviewed_by'      => $reviewer->id,
                'reviewed_at'      => now(),
            ]);
            $this->log($reviewer, 'reject_sorting_center', $hub, "Rejected sorting center application for hub \"{$hub->hub_name}\".", ['reason' => $reason]);
        });

        $this->mail($owner, new SortingCenterApplicationMail($owner, 'rejected', $reason, $hub), 'rejection');
    }

    /** Takes an approved hub off the network (its owner keeps their buyer account). */
    public function suspend(SortingCenter $hub, User $reviewer, string $reason): void
    {
        abort_if($hub->status !== SortingCenter::STATUS_APPROVED, 422, 'Only an approved hub can be suspended.');

        DB::transaction(function () use ($hub, $reviewer, $reason) {
            $hub->update(['status' => SortingCenter::STATUS_SUSPENDED, 'rejection_reason' => $reason, 'reviewed_by' => $reviewer->id, 'reviewed_at' => now()]);
            $this->log($reviewer, 'suspend_sorting_center', $hub, "Suspended hub \"{$hub->hub_name}\".", ['reason' => $reason]);
        });
    }

    public function reactivate(SortingCenter $hub, User $reviewer): void
    {
        abort_if($hub->status !== SortingCenter::STATUS_SUSPENDED, 422, 'Only a suspended hub can be reactivated.');

        DB::transaction(function () use ($hub, $reviewer) {
            $hub->update(['status' => SortingCenter::STATUS_APPROVED, 'rejection_reason' => null, 'reviewed_by' => $reviewer->id, 'reviewed_at' => now()]);
            $this->log($reviewer, 'reactivate_sorting_center', $hub, "Reactivated hub \"{$hub->hub_name}\".");
        });
    }

    /** @param array<string, mixed> $extra */
    private function log(User $reviewer, string $action, SortingCenter $hub, string $description, array $extra = []): void
    {
        // The admin activity log records platform admin actions; a courier's own decisions stay out of it.
        if ($reviewer->role !== 'admin') {
            return;
        }
        AdminActivityLog::create([
            'admin_id'    => $reviewer->id,
            'action'      => $action,
            'target_type' => 'sorting_center',
            'target_id'   => $hub->id,
            'description' => $description,
            'meta'        => ['sorting_center_id' => $hub->id, 'hub_name' => $hub->hub_name, 'user_id' => $hub->user_id] + $extra,
        ]);
    }

    private function mail(?User $owner, SortingCenterApplicationMail $mail, string $what): void
    {
        if (! $owner || ! $owner->email) {
            return;
        }
        try {
            Mail::to($owner->email)->queue($mail);
        } catch (\Throwable $e) {
            Log::error("Failed sending sorting center {$what} email: {$e->getMessage()}");
        }
    }
}
