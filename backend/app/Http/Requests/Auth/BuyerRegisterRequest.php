<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class BuyerRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'first_name'           => ['required', 'string', 'max:50'],
            'middle_name'          => ['nullable', 'string', 'max:50'],
            'last_name'            => ['required', 'string', 'max:50'],
            'email'                => ['required', 'email:rfc,dns', 'max:100', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'regex:/^\+[1-9]\d{6,14}$/', 'unique:users,phone'],
            'password'             => [
                'required', 'confirmed',
                Password::min(8)->mixedCase()->numbers()->symbols()->uncompromised(),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => 'Phone number must be in international format (e.g. +639171234567). No letters or special characters.',
        ];
    }
}
