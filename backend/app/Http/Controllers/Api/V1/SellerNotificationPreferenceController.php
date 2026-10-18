<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET/PUT /seller/notification-preferences: what the seller hears about by the bell and by email. Each category says
 * which channels it has; turning one off stops that channel for those events (account, security and application
 * notices are always sent).
 */
class SellerNotificationPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->format(NotificationPreferences::forSeller($request->user()))]);
    }

    public function update(Request $request): JsonResponse
    {
        $categories = implode(',', array_keys(NotificationPreferences::SELLER));
        $request->validate([
            'preferences'           => ['required', 'array'],
            'preferences.*'         => ['array'],
            'preferences.*.app'     => ['sometimes', 'boolean'],
            'preferences.*.email'   => ['sometimes', 'boolean'],
        ]);
        foreach (array_keys($request->input('preferences', [])) as $key) {
            if (! isset(NotificationPreferences::SELLER[$key])) {
                return response()->json(['message' => "Unknown notification type: {$key}. Use one of {$categories}.", 'errors' => ['preferences' => ["Unknown notification type: {$key}."]]], 422);
            }
        }

        $saved = NotificationPreferences::save($request->user(), $request->input('preferences'));

        return response()->json(['message' => 'Notification settings saved.', 'data' => $this->format($saved)]);
    }

    /** @param array<string, array{app: bool, email: bool}> $prefs */
    private function format(array $prefs): array
    {
        return collect(NotificationPreferences::SELLER)->map(fn ($def, $key) => [
            'key'         => $key,
            'label'       => $def[0],
            'description' => $def[1],
            'app'         => $prefs[$key]['app'],
            'email'       => $prefs[$key]['email'],
        ])->values()->all();
    }
}
