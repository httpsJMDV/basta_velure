@php
$recipientName = $firstName;
$tone = 'info'; $label = 'Delivery assignment'; $title = 'Your next deliveries are ready.';
$paragraphs = [$hubName . ' has assigned ' . $parcelCount . ' ' . ($parcelCount === 1 ? 'parcel' : 'parcels') . ' to you. Sign in to review your assignments and coordinate collection with your hub.'];
$details = ['Logistics hub' => $hubName, 'Parcels assigned' => $parcelCount, 'Delivery area' => $barangayName];
$actionLabel = 'View rider assignments'; $actionUrl = $loginUrl;
$note = 'Check the latest assignment details in your rider portal before starting your delivery run.';
$footer = 'You received this operational notification because parcels were assigned to your Loved-IT rider account.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
