@php
$recipientName = $firstName;
$tone = 'warning'; $label = 'Parcel return'; $title = 'A parcel has been returned.';
$paragraphs = ['Delivery of an order from ' . $shopName . ' could not be completed. ' . $hubName . ' has recorded the parcel as returned to you.', 'Sign in to review the order status and delivery history.'];
$details = ['Shop' => $shopName, 'Order' => $orderNumber, 'Tracking number' => $trackingNumber, 'Return reason' => $reasonLabel, 'Logistics hub' => $hubName];
$actionLabel = 'Sign in to view order'; $actionUrl = $loginUrl;
$note = 'Contact the logistics hub if you need clarification about the return.';
$footer = 'You received this operational notification about a parcel returned to your Loved-IT shop.';
$preview = $paragraphs[0];
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
