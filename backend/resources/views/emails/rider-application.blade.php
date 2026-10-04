<x-mail::message>
# {{ $decision === 'approved' ? 'Courier Application Approved!' : 'Update on Your Courier Application' }}

Hi {{ $firstName }},

@if ($decision === 'approved')
Congratulations! Your application to join **{{ $hubName }}** as a delivery courier has been **approved**.

Your rider account is now active. You can log in to your account to view your assigned delivery areas and begin dispatch operations.

<x-mail::button :url="$loginUrl" color="red">
Log In to Loved-IT
</x-mail::button>
@else
Thank you for your interest in joining the Loved-IT Logistics Network and applying to drive for **{{ $hubName }}**.

After careful review of your application, vehicle credentials, and submitted documentation, we regret to inform you that your courier application was not approved at this time.

@if ($reason)
**Reason for Decision:**
> {{ $reason }}
@endif

If you have questions regarding this decision, would like clarification, or wish to submit updated vehicle documentation, please reach out to {{ $hubName }} or contact our support team.
@endif

Thanks,<br>
**{{ $hubName }} & The Loved-IT Logistics Team**
</x-mail::message>
