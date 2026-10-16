@php
$recipientName = $name;
$label = 'Account security'; $title = 'Reset your password.';
$paragraphs = ['We received a request to reset the password for your Loved-IT account. Use the button below to choose a new password.'];
$details = ['Link expiry' => '60 minutes']; $actionLabel = 'Reset password'; $actionUrl = $resetUrl;
$note = 'If you did not request this reset, you can ignore this message. Your password will stay the same. Never share your reset link.';
$footer = 'You received this email because a password reset was requested for your Loved-IT account.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
