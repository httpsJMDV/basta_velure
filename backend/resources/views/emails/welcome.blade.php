@php
$recipientName = $name;
$label = 'Account registration'; $title = 'Welcome to Loved-IT.';
$paragraphs = ['Thank you for joining Loved-IT. Your account has been created.', 'If you have not completed your buyer application, sign in to finish your profile and submit the required information. Submitted applications are reviewed by our admin team before shopping access is approved.'];
$details = []; $actionLabel = 'Sign in to Loved-IT'; $actionUrl = $loginUrl;
$note = 'Account creation does not mean your buyer application has been approved.';
$footer = 'You received this email because an account was created using this email address on Loved-IT.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
