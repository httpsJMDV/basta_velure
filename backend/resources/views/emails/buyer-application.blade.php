@php
$recipientName = $firstName; $approved = $decision === 'approved';
$tone = $approved ? 'success' : 'danger';
$label = $approved ? 'Buyer account approved' : 'Buyer application update';
$title = $approved ? 'You’re in. Welcome to Loved-IT.' : 'An update on your application.';
$paragraphs = $approved
    ? ['Great news! Our admin team reviewed your ID and approved your buyer account. You can now sign in, save favourites and check out.']
    : ['Thank you for registering with Loved-IT. After reviewing your buyer application, we were unable to approve it at this time.', 'You can fix the issue below and submit your details again from your account.'];
$highlight = (!$approved && $reason) ? ['title' => 'Review feedback', 'body' => $reason] : null;
$details = ['Application status' => $approved ? 'Approved' : 'Not approved'];
$actionLabel = 'Sign in to Loved-IT'; $actionUrl = $approved ? $loginUrl : null;
$note = $approved ? 'Your next favourite find awaits.' : 'If you have questions about this decision, please contact the Loved-IT support team through the website.';
$footer = 'You received this email because you submitted a buyer application with Loved-IT.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
