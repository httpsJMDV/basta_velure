<?php

namespace App\Http\Middleware;

use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The courier company portal: only the team of an approved courier company. The company is attached to the request
 * (attribute "logistics_company") so every portal query is scoped to it.
 */
class EnsureLogisticsMember
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $membership = $user ? LogisticsCompanyMember::with('company')->where('user_id', $user->id)->first() : null;
        $company = $membership?->company;

        if (! $company) {
            abort(403, 'Courier company account required.');
        }
        if ($company->status !== LogisticsCompany::STATUS_APPROVED) {
            abort(403, match ($company->status) {
                LogisticsCompany::STATUS_PENDING => 'Your courier company application is waiting for review.',
                LogisticsCompany::STATUS_SUSPENDED => 'Your courier company is suspended. Please contact platform administration.',
                default => 'Your courier company application was not approved.',
            });
        }

        $request->attributes->set('logistics_company', $company);

        return $next($request);
    }
}
