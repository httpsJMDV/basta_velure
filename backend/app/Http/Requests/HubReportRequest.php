<?php

namespace App\Http\Requests;

use App\Services\HubReportService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * from/to for the hub reports: inclusive Asia/Manila days, Y-m-d. Missing values default to the last 30 days ending
 * today (Manila). The hub itself comes from the authenticated user, never from the request.
 */
class HubReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $service = app(HubReportService::class);
        $to = $this->filled('to') ? $this->input('to') : $service->today();

        $defaults = ['to' => $to];
        if (! $this->filled('from')) {
            $parsed = $this->parse($to);
            $defaults['from'] = $parsed ? $parsed->subDays(HubReportService::DEFAULT_DAYS - 1)->toDateString() : $to;
        }

        $this->merge($defaults);
    }

    public function rules(): array
    {
        return [
            'from' => ['required', 'string', 'date_format:Y-m-d', 'before_or_equal:to'],
            'to'   => [
                'required', 'string', 'date_format:Y-m-d',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $from = $this->parse($this->input('from'));
                    $to = $this->parse($value);
                    if ($from && $to && $from->lte($to) && $from->diffInDays($to) + 1 > HubReportService::MAX_DAYS) {
                        $fail('The date range cannot be longer than ' . HubReportService::MAX_DAYS . ' days.');
                    }
                },
            ],
            'sort'      => ['nullable', 'string', Rule::in(HubReportService::RIDER_SORTS)],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'report'    => ['sometimes', 'required', 'string', Rule::in(['daily', 'riders'])],
        ];
    }

    public function messages(): array
    {
        return [
            'from.date_format'      => 'Use the date format YYYY-MM-DD.',
            'to.date_format'        => 'Use the date format YYYY-MM-DD.',
            'from.before_or_equal'  => 'The start date must be on or before the end date.',
            'report.in'             => 'Choose the daily or riders report.',
        ];
    }

    /** A real calendar date in Y-m-d, or null (so "2026-02-30" is rejected rather than rolled over). */
    private function parse(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value)) {
            return null;
        }

        // Carbon throws on text that does not match the format; an unparseable date is just an invalid one.
        try {
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $value, HubReportService::TIMEZONE);
        } catch (\Throwable) {
            return null;
        }

        return $date && $date->format('Y-m-d') === $value ? $date : null;
    }
}
