@php
$recipientName = $firstName; $approved = $decision === 'approved';
$label = 'Logistics hub application'; $title = $approved ? 'Your hub is approved.' : 'An update on your hub application.';
$paragraphs = $approved ? ['Our admin team has approved your application to operate ' . $hubName . ' as a Loved-IT logistics sorting center.', 'Sign in to your hub portal to manage parcels, review courier applications, and coordinate delivery operations.'] : ['Thank you for applying to operate ' . $hubName . '. After reviewing your application and submitted documents, our admin team was unable to approve it at this time.'];
$details = ['Logistics hub' => $hubName, 'Application status' => $approved ? 'Approved' : 'Not approved'];
if (!$approved && $reason) $details['Review feedback'] = $reason;
$actionLabel = 'Sign in to hub portal'; $actionUrl = $approved ? $loginUrl : null;
$note = 'For questions about this decision, please contact support through the website.';
$footer = 'You received this email because you submitted a logistics hub application with Loved-IT.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
