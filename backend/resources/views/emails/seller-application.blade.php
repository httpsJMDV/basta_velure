@php
$recipientName = $firstName;
$label = 'Seller application'; $title = 'Your application is with us.';
$paragraphs = ['Thank you for applying to sell on Loved-IT. Our admin team will review your shop information and submitted documents.', 'Seller features become available once your shop is approved.'];
$details = ['Shop' => $shopName, 'Application status' => 'Under review'];
$actionLabel = 'Sign in to Loved-IT'; $actionUrl = $loginUrl;
$note = 'For questions about your application, please contact support through the website.';
$footer = 'You received this email because a seller application was submitted using your Loved-IT account.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
