{{ $decision === 'approved' ? 'Your Loved-IT buyer account has been approved' : 'Update on your Loved-IT buyer application' }}

Hi {{ $firstName }},

@if ($decision === 'approved')
Our admin team has reviewed and approved your buyer application. Your Loved-IT buyer account is ready, and you can now sign in and start shopping.

Sign in to Loved-IT: {{ $loginUrl }}
@else
Thank you for registering with Loved-IT. After reviewing your application, we were unable to approve it at this time.
@if ($reason)

Review feedback: {{ $reason }}
@endif

If you have questions, please contact the Loved-IT support team through the website.
@endif

With love,
The Loved-IT Team

You received this email because you submitted a buyer application with Loved-IT.
