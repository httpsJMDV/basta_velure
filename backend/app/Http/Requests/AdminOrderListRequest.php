<?php

namespace App\Http\Requests;

use App\Http\Controllers\Api\V1\AdminOrderController;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Filters of the admin Orders list and summary. Every filter is optional. `from` and `to` are inclusive Asia/Manila
 * days (YYYY-MM-DD) on the day the order was placed. `status` accepts the OrderStatus values and the legacy names;
 * `group` is one of the status groups (see AdminOrderController::statusGroups()).
 */
class AdminOrderListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status'         => ['nullable', 'string', 'max:40'],
            'group'          => ['nullable', 'string', Rule::in(array_keys(AdminOrderController::statusGroups()))],
            'payment_method' => ['nullable', 'string', Rule::in(['gcash', 'cod'])],
            'payment_status' => ['nullable', 'string', Rule::in(['pending', 'paid', 'failed', 'pending_verification'])],
            'search'         => ['nullable', 'string', 'max:100'],
            'from'           => ['nullable', 'string', 'date_format:Y-m-d', 'required_with:to'],
            'to'             => ['nullable', 'string', 'date_format:Y-m-d', 'required_with:from', 'after_or_equal:from'],
            'sort'           => ['nullable', 'string', Rule::in(['date', 'total'])],
            'direction'      => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'per_page'       => ['nullable', 'integer', 'min:1', 'max:100'],
            'page'           => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'from.date_format'  => 'Use the date format YYYY-MM-DD.',
            'to.date_format'    => 'Use the date format YYYY-MM-DD.',
            'to.after_or_equal' => 'The end date must be on or after the start date.',
        ];
    }
}
