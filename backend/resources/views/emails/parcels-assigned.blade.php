<x-mail::message>
# New parcels assigned to you

Hi {{ $firstName }},

**{{ $hubName }}** has assigned **{{ $parcelCount }} {{ $parcelCount === 1 ? 'parcel' : 'parcels' }}** to you for delivery in **{{ $barangayName }}**.

Log in to Loved-IT to see your assignments. Please collect the parcels from the hub when you are ready to start your run.

<x-mail::button :url="$loginUrl" color="red">
Log In to Loved-IT
</x-mail::button>

Thanks,<br>
**{{ $hubName }} & The Loved-IT Logistics Team**
</x-mail::message>
