<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $decision === 'approved' ? 'Your buyer account is approved' : 'Your application update' }} | Loved-IT</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;color:#0D0D0D;font-family:Inter,Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{ $decision === 'approved' ? 'Your application is approved. Sign in and discover your next favourite find.' : 'An update on your Loved-IT buyer application.' }}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F5F5;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E8E8E8;border-radius:16px;overflow:hidden;">
<tr><td style="height:5px;background-color:#C0001A;font-size:1px;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 24px;border-bottom:1px solid #EEEEEE;">
<img src="{{ $message->embed(resource_path('images/loved-it-logo.png')) }}" width="164" alt="Loved-IT" style="display:block;width:164px;max-width:100%;height:auto;border:0;">
</td></tr>
<tr><td style="padding:36px 32px;">
<p style="margin:0 0 16px;color:#C0001A;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{{ $decision === 'approved' ? 'Application approved' : 'Application update' }}</p>
<h1 style="margin:0 0 24px;font-size:32px;line-height:1.2;letter-spacing:-1px;font-weight:800;">{{ $decision === 'approved' ? 'You’re in. Welcome to Loved-IT.' : 'An update on your application.' }}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hi {{ $firstName }},</p>
@if ($decision === 'approved')
<p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.7;">Great news! Our admin team has reviewed and approved your buyer application. Your Loved-IT buyer account is ready, and you can now sign in and start shopping.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F5F5;border-radius:10px;">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 8px;font-size:15px;font-weight:700;">Your next favourite find awaits.</p>
<p style="margin:0;color:#555555;font-size:14px;line-height:1.7;">Explore the collection, save pieces you love, and shop when you're ready.</p>
</td></tr></table>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center" bgcolor="#C0001A" style="border-radius:8px;mso-padding-alt:16px 28px;">
<a href="{{ $loginUrl }}" style="display:inline-block;padding:16px 28px;border:1px solid #C0001A;border-radius:8px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">Sign in to Loved-IT &rarr;</a>
</td></tr></table>
<p style="margin:0;color:#777777;font-size:12px;line-height:1.7;">If the button doesn't work, copy this link into your browser:<br><a href="{{ $loginUrl }}" style="color:#C0001A;word-break:break-all;">{{ $loginUrl }}</a></p>
@else
<p style="margin:0 0 24px;color:#555555;font-size:16px;line-height:1.7;">Thank you for registering with Loved-IT. After reviewing your buyer application, we were unable to approve it at this time.</p>
@if ($reason)
<div style="padding:20px;background-color:#F5F5F5;border-left:3px solid #C0001A;border-radius:8px;">
<p style="margin:0 0 8px;font-size:14px;font-weight:700;">Review feedback</p>
<p style="margin:0;color:#555555;font-size:14px;line-height:1.7;white-space:pre-line;">{{ $reason }}</p>
</div>
@endif
<p style="margin:24px 0 0;color:#555555;font-size:14px;line-height:1.7;">If you have questions about this decision, please contact the Loved-IT support team through the website.</p>
@endif
<p style="margin:28px 0 0;font-size:14px;line-height:1.7;">With love,<br><strong>The Loved-IT Team</strong></p>
</td></tr>
<tr><td style="padding:24px 32px;background-color:#0D0D0D;color:#BBBBBB;font-size:12px;line-height:1.8;">
<p style="margin:0 0 8px;color:#FFFFFF;font-weight:700;">Loved-IT</p>
<p style="margin:0;">You received this email because you submitted a buyer application with Loved-IT.</p>
<p style="margin:12px 0 0;">&copy; {{ date('Y') }} Loved-IT. All rights reserved.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>
