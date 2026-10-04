<x-mail::message>
# {{ $decision === 'approved' ? 'Sorting Center Application Approved!' : 'Update on Your Sorting Center Application' }}

Hi {{ $firstName }},

@if ($decision === 'approved')
Congratulations! Your application to operate **{{ $hubName }}** as an authorized Loved-IT Regional Sorting Center has been **approved**.

Your hub account is now active. You can log in to your account to begin managing parcel routing, inbound processing, and last-mile delivery rider dispatch.

<x-mail::button :url="$loginUrl" color="red">
Log In to Loved-IT
</x-mail::button>
@else
Thank you for your interest in joining the Loved-IT Logistics Network and applying to operate **{{ $hubName }}**.

After careful administrative review of your application and submitted documentation, we regret to inform you that your application was not approved at this time.

@if ($reason)
**Reason for Decision:**
> {{ $reason }}
@endif

If you have questions regarding this decision, would like clarification, or wish to submit updated documentation, please contact our support team.
@endif

Thanks,<br>
**The Loved-IT Team**
</x-mail::message>
