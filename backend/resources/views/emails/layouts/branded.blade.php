<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }} | Loved-IT</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;color:#0D0D0D;font-family:Inter,Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{ $preview }}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F5F5;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E8E8E8;border-radius:16px;overflow:hidden;">
<tr><td style="height:5px;background-color:#C0001A;font-size:1px;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 24px;border-bottom:1px solid #EEEEEE;">
<img src="{{ $message->embed(resource_path('images/loved-it-logo.png')) }}" width="164" alt="Loved-IT" style="display:block;width:164px;max-width:100%;height:auto;border:0;">
</td></tr>
<tr><td style="padding:36px 32px;">
<p style="margin:0 0 16px;color:#C0001A;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{{ $label }}</p>
<h1 style="margin:0 0 24px;font-size:32px;line-height:1.2;letter-spacing:-1px;">{{ $title }}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hi {{ $recipientName }},</p>
@foreach ($paragraphs as $paragraph)
<p style="margin:0 0 20px;color:#555555;font-size:16px;line-height:1.7;">{{ $paragraph }}</p>
@endforeach
@if (!empty($details))
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F5F5;border-radius:10px;">
@foreach ($details as $detailLabel => $detailValue)
<tr><td style="padding:12px 20px;font-size:14px;line-height:1.7;"><strong>{{ $detailLabel }}</strong><br><span style="color:#555555;white-space:pre-line;">{{ $detailValue }}</span></td></tr>
@endforeach
</table>
@endif
@if (!empty($actionUrl))
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td bgcolor="#C0001A" style="border-radius:8px;mso-padding-alt:16px 28px;"><a href="{{ $actionUrl }}" style="display:inline-block;padding:16px 28px;border:1px solid #C0001A;border-radius:8px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">{{ $actionLabel }} &rarr;</a></td></tr></table>
<p style="margin:0;color:#777777;font-size:12px;line-height:1.7;">If the button doesn't work, copy this link into your browser:<br><a href="{{ $actionUrl }}" style="color:#C0001A;word-break:break-all;">{{ $actionUrl }}</a></p>
@endif
<p style="margin:24px 0 0;color:#555555;font-size:14px;line-height:1.7;">{{ $note }}</p>
<p style="margin:28px 0 0;font-size:14px;line-height:1.7;">With love,<br><strong>The Loved-IT Team</strong></p>
</td></tr>
<tr><td style="padding:24px 32px;background-color:#0D0D0D;color:#BBBBBB;font-size:12px;line-height:1.8;">
<p style="margin:0 0 8px;color:#FFFFFF;font-weight:700;">Loved-IT</p>
<p style="margin:0;">{{ $footer }}</p>
<p style="margin:12px 0 0;">&copy; {{ date('Y') }} Loved-IT. All rights reserved.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>
