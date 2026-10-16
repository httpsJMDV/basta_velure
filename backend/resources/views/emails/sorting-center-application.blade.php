@php
$recipientName = $firstName; $approved = $decision === 'approved';
$tone = $approved ? 'success' : 'danger';
$label = $approved ? 'Hub application approved' : 'Hub application update';
$title = $approved ? 'Your hub is approved.' : 'An update on your hub application.';
$paragraphs = $approved
    ? ['Our admin team approved ' . $hubName . ' as a Loved-IT logistics sorting center.', 'Open your hub dashboard to receive and sort parcels, review courier applications and dispatch deliveries.']
    : ['Thank you for applying to operate ' . $hubName . '. After reviewing your permit and coverage, our admin team was unable to approve it at this time.', 'You can fix the issue below and resubmit from your account.'];
$highlight = (!$approved && $reason) ? ['title' => 'Review feedback', 'body' => $reason] : null;
$details = ['Logistics hub' => $hubName, 'Application status' => $approved ? 'Approved' : 'Not approved'];
$actionLabel = $approved ? 'Open hub dashboard' : 'Review and resubmit'; $actionUrl = $loginUrl;
$note = 'For questions about this decision, please contact support through the website.';
$footer = 'You received this email because you applied to run a logistics hub on Loved-IT.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
