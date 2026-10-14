<x-mail::message>
# A parcel is being returned to you

Hi {{ $firstName }},

Delivery of order **{{ $orderNumber }}** from **{{ $shopName }}** could not be completed, and **{{ $hubName }}** has returned the parcel to you.

- **Order:** {{ $orderNumber }}
- **Tracking number:** {{ $trackingNumber }}
- **Reason:** {{ $reasonLabel }}

Log in to Loved-IT to see the order's status and history.

<x-mail::button :url="$loginUrl" color="red">
Log In to Loved-IT
</x-mail::button>

Thanks,<br>
**{{ $hubName }} & The Loved-IT Logistics Team**
</x-mail::message>
