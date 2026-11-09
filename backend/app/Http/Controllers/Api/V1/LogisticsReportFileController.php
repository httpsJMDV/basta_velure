<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\HubReportRequest;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\HubReportService;
use App\Services\Reports\LogisticsReports;
use App\Services\Reports\ReportDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Reports of the hub, the courier network and the rider, each as JSON (the report screens), Excel and PDF
 * (docs/api/logistics-rider-reports.md):
 *
 *   GET  /{hub|logistics|rider}/reports/document?from=&to=            the report as JSON
 *   GET  /{hub|logistics|rider}/reports/file?format=xlsx|pdf&from=&to= the file, for the website (with the token)
 *   POST /{hub|logistics|rider}/reports/link {format, from, to}       a link that works for 10 minutes without the
 *                                                                      token, so the app can open it in the phone's
 *                                                                      browser and the file lands in Downloads
 *   GET  /reports/files/{kind}?user=&format=&from=&to=&signature=      that link
 *
 * The hub, company or rider always comes from the signed-in account (or the account the link was made for), never
 * from the request.
 */
class LogisticsReportFileController extends Controller
{
    private const KINDS = ['hub', 'courier', 'rider'];

    public function __construct(private readonly LogisticsReports $reports, private readonly HubReportService $hubReports)
    {
    }

    public function document(HubReportRequest $request, string $kind): JsonResponse
    {
        return response()->json(['data' => $this->build($kind, $request->user(), $request)->toArray()]);
    }

    public function file(HubReportRequest $request, string $kind): Response
    {
        $format = $this->format($request);

        return $this->send($this->build($kind, $request->user(), $request), $format);
    }

    public function link(HubReportRequest $request, string $kind): JsonResponse
    {
        $format = $this->format($request);
        // Checks access now, so a link is never made for a report the account can't see.
        $this->subject($kind, $request->user());
        $expires = now()->addMinutes(10);
        $url = URL::temporarySignedRoute('reports.file', $expires, [
            'kind'   => $kind,
            'user'   => $request->user()->id,
            'format' => $format,
            'from'   => $request->validated('from'),
            'to'     => $request->validated('to'),
        ]);

        return response()->json(['data' => ['url' => $url, 'expires_at' => $expires->toIso8601String(), 'format' => $format]]);
    }

    /** The signed link from link(). */
    public function signed(HubReportRequest $request, string $kind): Response
    {
        abort_unless(in_array($kind, self::KINDS, true), 404);
        $user = User::find((int) $request->query('user'));
        abort_if(! $user || $user->status !== 'active', 403, 'This account can no longer download reports.');

        return $this->send($this->build($kind, $user, $request), $this->format($request));
    }

    private function build(string $kind, User $user, HubReportRequest $request): ReportDocument
    {
        $range = $this->hubReports->range($request->validated('from'), $request->validated('to'));
        $subject = $this->subject($kind, $user);

        return match ($kind) {
            'hub'     => $this->reports->hub($subject, $range),
            'courier' => $this->reports->courier($subject, $range),
            'rider'   => $this->reports->rider($subject, $range),
        };
    }

    /** The account's own hub, company or rider profile, with the same checks as the portal's middleware. */
    private function subject(string $kind, User $user): SortingCenter|LogisticsCompany|Rider
    {
        switch ($kind) {
            case 'hub':
                $hub = $user->sortingCenter;
                abort_if(! $hub || $hub->status !== SortingCenter::STATUS_APPROVED, 403, 'Sorting center account not approved.');

                return $hub;
            case 'courier':
                $company = LogisticsCompanyMember::with('company')->where('user_id', $user->id)->first()?->company;
                abort_if(! $company || $company->status !== LogisticsCompany::STATUS_APPROVED, 403, 'Courier company account required.');

                return $company;
            case 'rider':
                $rider = Rider::where('user_id', $user->id)->first();
                abort_if(! $rider || in_array($rider->status, [Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED], true), 403, 'Rider account required.');

                return $rider;
            default:
                abort(404);
        }
    }

    private function format(Request $request): string
    {
        $format = (string) $request->input('format', $request->query('format', ''));
        if (! in_array($format, ['xlsx', 'pdf'], true)) {
            abort(response()->json([
                'message' => 'Choose Excel or PDF.',
                'errors'  => ['format' => ['Choose Excel or PDF.']],
            ], 422));
        }

        return $format;
    }

    private function send(ReportDocument $doc, string $format): Response
    {
        [$bytes, $type] = $format === 'xlsx'
            ? [$doc->xlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
            : [$doc->pdf(), 'application/pdf'];

        return response($bytes, 200, [
            'Content-Type'           => $type,
            'Content-Disposition'    => 'attachment; filename="' . $doc->filename($format) . '"',
            'Content-Length'         => (string) strlen($bytes),
            'Cache-Control'          => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
