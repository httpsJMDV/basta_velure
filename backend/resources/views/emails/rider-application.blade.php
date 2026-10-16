@php
$recipientName = $firstName; $approved = $decision === 'approved';
$label = 'Courier application'; $title = $approved ? 'You are ready to ride.' : 'An update on your application.';
$paragraphs = $approved ? ['Your application to join ' . $hubName . ' as a delivery courier has been approved.', 'Sign in to your rider account to check assigned areas and delivery work. Contact your hub for onboarding instructions.'] : ['Thank you for applying to join ' . $hubName . '. After reviewing your courier application, the hub was unable to approve it at this time.'];
$details = ['Logistics hub' => $hubName, 'Application status' => $approved ? 'Approved' : 'Not approved'];
if (!$approved && $reason) $details['Review feedback'] = $reason;
$actionLabel = 'Sign in to rider portal'; $actionUrl = $approved ? $loginUrl : null;
$note = 'For questions about this decision, contact ' . $hubName . ' or support through the website.';
$footer = 'You received this email because you submitted a courier application to ' . $hubName . '.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
