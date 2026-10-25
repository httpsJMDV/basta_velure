<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LogisticsCompanyResource;
use App\Models\LogisticsCompany;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * The courier company's own details on its Settings page (Amaru task 2). The team edits how people reach it (the
 * description, contact email and phone) and its logo. The name, code, SEC number, TIN and address were reviewed by
 * the admin, so they are changed through Loved-IT support, not here.
 */
class LogisticsCompanyProfileController extends Controller
{
    /** PATCH /logistics/company {description?, contact_email, contact_phone} */
    public function update(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $request->merge([
            'contact_phone' => PhMobile::prepare($request->input('contact_phone')),
            'contact_email' => is_string($request->input('contact_email')) ? mb_strtolower(trim($request->input('contact_email'))) : $request->input('contact_email'),
            'description'   => is_string($request->input('description')) ? trim(strip_tags($request->input('description'))) : $request->input('description'),
        ]);
        $data = $request->validate([
            'description'   => ['nullable', 'string', 'max:500'],
            'contact_email' => ['required', 'email:rfc', 'max:150'],
            'contact_phone' => ['required', ...PhMobile::rules()],
        ], [
            'description.max'        => 'The description can be at most 500 characters.',
            'contact_email.required' => 'Enter the email people can reach the company on.',
            'contact_email.email'    => 'Enter a valid email address.',
            'contact_phone.required' => 'Enter the company\'s mobile number.',
            'contact_phone.regex'    => PhMobile::MESSAGE,
        ]);

        $company->update(['description' => ($data['description'] ?? '') !== '' ? $data['description'] : null] + $data);

        return response()->json(['message' => 'Company details saved.', 'data' => (new LogisticsCompanyResource($company->fresh()))->full()]);
    }

    /** POST /logistics/company/logo {logo}: JPG or PNG up to 5 MB, replacing the old one. */
    public function logo(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $request->validate(['logo' => Validation::image()], Validation::uploadMessages('logo', 'the logo'));

        $old = $company->logo_path;
        $company->update(['logo_path' => $request->file('logo')->store('courier_logos', 'public')]);
        if ($old) {
            Storage::disk('public')->delete($old);
        }

        return response()->json(['message' => 'Logo updated.', 'data' => (new LogisticsCompanyResource($company->fresh()))->full()]);
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }
}
