<x-mail::message>
# {{ $decision === 'approved' ? 'Your Account Has Been Approved!' : 'Update on Your Application' }}

Hi {{ $firstName }},

@if ($decision === 'approved')
Great news! Your Loved-IT buyer account has been **approved**. You can now log in and start shopping.

<x-mail::button :url="$loginUrl" color="red">
Log In to Loved-IT
</x-mail::button>
@else
Thank you for registering with Loved-IT. After reviewing your application, we were unable to approve your account at this time.

@if ($reason)
**Reason:** {{ $reason }}
@endif

If you believe this is a mistake or have questions, please contact our support team.
@endif

Thanks,
**The Loved-IT Team**
</x-mail::message>
