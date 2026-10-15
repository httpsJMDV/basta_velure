<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * The account is named by ONE identifier: an email or a username. Clients send it as "identifier"; the older
     * "email" key is still accepted and means the same thing. Format is not checked here, so a malformed or unknown
     * identifier gets the same generic 401 as a wrong password.
     */
    public function rules(): array
    {
        return [
            'identifier' => ['required_without:email', 'nullable', 'string', 'max:255'],
            'email'      => ['required_without:identifier', 'nullable', 'string', 'max:255'],
            'password'   => ['required', 'string'],
        ];
    }

    /** The identifier as typed, trimmed. */
    public function identifier(): string
    {
        return trim((string) ($this->input('identifier') ?? $this->input('email')));
    }
}
