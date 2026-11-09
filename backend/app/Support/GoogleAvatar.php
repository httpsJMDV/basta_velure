<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The Google profile picture of a "Continue with Google" account, copied onto the public disk so it shows like any
 * other profile photo. Only pictures on Google's own photo hosts are fetched: the link can come from the client
 * (the website's complete-profile form sends it back), and fetching any address it names would let a caller make
 * the server read internal URLs.
 */
final class GoogleAvatar
{
    /** Google answers with 96 px by default; this is large enough for the profile screens. */
    private const SIZE = 400;

    private const MAX_BYTES = 2 * 1024 * 1024;

    /** True for an https link on googleusercontent.com, where Google serves profile pictures. */
    public static function isGooglePhoto(?string $url): bool
    {
        if (! is_string($url) || $url === '') {
            return false;
        }
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));

        return ($parts['scheme'] ?? null) === 'https'
            && ! isset($parts['user'])
            && ! isset($parts['port'])
            && ($host === 'googleusercontent.com' || str_ends_with($host, '.googleusercontent.com'));
    }

    /** The same picture at [SIZE] px ("…=s96-c" becomes "…=s400-c"). */
    public static function sized(string $url): string
    {
        return preg_match('/=s\d+(-c)?$/', $url)
            ? (string) preg_replace('/=s\d+(-c)?$/', '=s' . self::SIZE . '-c', $url)
            : $url;
    }

    /**
     * Downloads the picture and stores it under avatars/ on the public disk. Returns the stored path, or null when
     * the link is not a Google photo or the download fails (an account without a photo is fine).
     */
    public static function store(?string $url): ?string
    {
        if (! self::isGooglePhoto($url)) {
            return null;
        }

        try {
            $client = app()->environment('local') ? Http::withoutVerifying() : Http::withOptions([]);
            $response = $client->withOptions(['allow_redirects' => false])->timeout(8)->get(self::sized($url));
            $type = strtolower((string) $response->header('Content-Type'));
            $body = $response->body();
            if (! $response->successful() || ! str_starts_with($type, 'image/') || $body === '' || strlen($body) > self::MAX_BYTES) {
                return null;
            }

            $extension = str_contains($type, 'png') ? 'png' : (str_contains($type, 'webp') ? 'webp' : 'jpg');
            $path = 'avatars/' . Str::uuid() . '.' . $extension;
            Storage::disk('public')->put($path, $body);

            return $path;
        } catch (\Throwable) {
            return null;
        }
    }
}
