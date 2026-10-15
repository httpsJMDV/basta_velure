<?php

namespace App\Http\Requests;

use App\Services\AdminAnalyticsService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The date range of the admin reports: either explicit `from` and `to` (inclusive Asia/Manila days, Y-m-d) or a
 * `range` preset (7d, 30d, 90d, 12m, all). Explicit dates win over a preset; with neither, the last 30 days.
 */
class AdminReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'range'    => ['nullable', 'string', Rule::in(AdminAnalyticsService::PRESETS)],
            'interval' => ['nullable', 'string', Rule::in(['daily', 'monthly'])],
            'from'     => ['nullable', 'string', 'date_format:Y-m-d', 'required_with:to'],
            'to'       => [
                'nullable', 'string', 'date_format:Y-m-d', 'required_with:from', 'after_or_equal:from',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $from = $this->parse($this->input('from'));
                    $to = $this->parse($value);
                    if ($from && $to && $from->lte($to) && $from->diffInDays($to) + 1 > AdminAnalyticsService::MAX_DAYS) {
                        $fail('The date range cannot be longer than ' . AdminAnalyticsService::MAX_DAYS . ' days.');
                    }
                },
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'from.date_format'     => 'Use the date format YYYY-MM-DD.',
            'to.date_format'       => 'Use the date format YYYY-MM-DD.',
            'to.after_or_equal'    => 'The end date must be on or after the start date.',
            'range.in'             => 'The range must be one of 7d, 30d, 90d, 12m or all.',
        ];
    }

    /** The validated range as the service understands it. */
    public function analyticsRange(): array
    {
        $service = app(AdminAnalyticsService::class);

        if ($this->filled('from') && $this->filled('to')) {
            return $service->range($this->input('from'), $this->input('to'));
        }

        return $service->preset((string) ($this->input('range') ?: '30d'));
    }

    /** Daily or monthly buckets: monthly when asked, or when a daily chart would be too long to read. */
    public function chartInterval(array $range): string
    {
        return ($this->input('interval') === 'monthly' || $range['days'] > 366) ? 'monthly' : 'daily';
    }

    private function parse(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        try {
            return CarbonImmutable::createFromFormat('!Y-m-d', $value, AdminAnalyticsService::TIMEZONE);
        } catch (\Throwable) {
            return null;
        }
    }
}
