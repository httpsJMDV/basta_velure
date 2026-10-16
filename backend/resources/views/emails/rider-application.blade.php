@php
$recipientName = $firstName; $approved = $decision === 'approved';
$tone = $approved ? 'success' : 'danger';
$label = $approved ? 'Courier application approved' : 'Courier application update';
$title = $approved ? 'You are ready to ride.' : 'An update on your application.';
$paragraphs = $approved
    ? ['Your application to deliver for ' . $hubName . ' has been approved.', 'Open your courier dashboard to see your areas and pickups. Contact your hub for onboarding instructions.']
    : ['Thank you for applying to deliver for ' . $hubName . '. After reviewing your documents, the hub was unable to approve your application at this time.', 'You can fix the issue below and resubmit from your account.'];
$highlight = (!$approved && $reason) ? ['title' => 'Review feedback', 'body' => $reason] : null;
$details = ['Logistics hub' => $hubName, 'Application status' => $approved ? 'Approved' : 'Not approved'];
$actionLabel = $approved ? 'Open courier dashboard' : 'Review and resubmit'; $actionUrl = $loginUrl;
$note = 'For questions about this decision, contact ' . $hubName . ' or support through the website.';
$footer = 'You received this email because you applied to be a courier for ' . $hubName . ' on Loved-IT.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
