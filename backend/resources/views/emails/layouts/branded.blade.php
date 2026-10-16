@php
    // Shared shell of every Loved-IT email. Each template sets the content variables and includes this layout.
    // Optional: $tone (success | warning | danger | info | neutral), $highlight (['title' => , 'body' => ]),
    // $items (rows of ['name' => , 'meta' => , 'amount' => ]), $totals (label => value, the last one is the total),
    // $details (label => value), $actionUrl / $actionLabel, $note.
    $tone = $tone ?? 'neutral';
    $tones = [
        'success' => ['fg' => '#0F7A3D', 'bg' => '#EAF7EF', 'bd' => '#BFE6CD'],
        'warning' => ['fg' => '#8A5A00', 'bg' => '#FFF6E0', 'bd' => '#F5DDA0'],
        'danger'  => ['fg' => '#B00018', 'bg' => '#FDECEE', 'bd' => '#F5C2C8'],
        'info'    => ['fg' => '#1D4ED8', 'bg' => '#EEF3FF', 'bd' => '#C9D7FB'],
        'neutral' => ['fg' => '#C0001A', 'bg' => '#FDF0F1', 'bd' => '#F3C9CE'],
    ];
    $t = $tones[$tone] ?? $tones['neutral'];
    $details = $details ?? [];
    $items = $items ?? [];
    $totals = $totals ?? [];
    $highlight = $highlight ?? null;
    $note = $note ?? null;
@endphp
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>{{ $title }} | Loved-IT</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F1EF;color:#141414;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{{ $preview }}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F3F1EF;">
<tr><td align="center" style="padding:32px 12px 40px;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
{{-- Brand bar: the theme's dark-to-red band --}}
<tr><td style="height:6px;line-height:6px;font-size:1px;border-radius:14px 14px 0 0;background-color:#2D1515;background-image:linear-gradient(90deg,#1A1A1A 0%,#3D1A1A 55%,#C0001A 100%);">&nbsp;</td></tr>

<tr><td style="background-color:#FFFFFF;border-left:1px solid #E7E2DE;border-right:1px solid #E7E2DE;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
{{-- Header --}}
<tr><td style="padding:28px 36px 22px;border-bottom:1px solid #F0ECE8;">
<img src="{{ isset($message) ? $message->embed(resource_path('images/loved-it-logo.png')) : '' }}" width="150" alt="Loved-IT" style="display:block;width:150px;max-width:100%;height:auto;border:0;">
</td></tr>

{{-- Status label and headline --}}
<tr><td style="padding:32px 36px 4px;">
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td style="padding:5px 12px;border-radius:999px;background-color:{{ $t['bg'] }};border:1px solid {{ $t['bd'] }};color:{{ $t['fg'] }};font-size:12px;font-weight:700;letter-spacing:0.3px;">&#9679;&nbsp;{{ $label }}</td>
</tr></table>
<h1 style="margin:18px 0 0;font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:#141414;">{{ $title }}</h1>
</td></tr>

{{-- Message --}}
<tr><td style="padding:20px 36px 8px;">
<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#141414;">Hi {{ $recipientName }},</p>
@foreach ($paragraphs as $paragraph)
<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#4A4744;">{{ $paragraph }}</p>
@endforeach
</td></tr>

@if ($highlight)
{{-- A reason or note the reader must see (rejection feedback, delivery problem) --}}
<tr><td style="padding:6px 36px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:10px;background-color:{{ $t['bg'] }};border:1px solid {{ $t['bd'] }};">
<tr><td style="padding:16px 18px;">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:{{ $t['fg'] }};">{{ $highlight['title'] }}</p>
<p style="margin:0;font-size:14px;line-height:1.65;color:#2B2826;white-space:pre-line;">{{ $highlight['body'] }}</p>
</td></tr></table>
</td></tr>
@endif

@if (!empty($items))
{{-- Line items --}}
<tr><td style="padding:10px 36px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #EEE9E5;border-radius:10px;">
@foreach ($items as $i => $item)
<tr>
<td style="padding:12px 16px;{{ $i > 0 ? 'border-top:1px solid #F2EEEA;' : '' }}font-size:14px;line-height:1.45;color:#141414;">
<strong style="font-weight:600;">{{ $item['name'] }}</strong>
@if (!empty($item['meta']))<br><span style="font-size:12px;color:#8A847F;">{{ $item['meta'] }}</span>@endif
</td>
<td align="right" style="padding:12px 16px;{{ $i > 0 ? 'border-top:1px solid #F2EEEA;' : '' }}font-size:14px;color:#141414;white-space:nowrap;font-variant-numeric:tabular-nums;">{{ $item['amount'] ?? '' }}</td>
</tr>
@endforeach
</table>
</td></tr>
@endif

@if (!empty($totals))
<tr><td style="padding:8px 36px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
@foreach ($totals as $totalLabel => $totalValue)
@php $last = $loop->last; @endphp
<tr>
<td style="padding:{{ $last ? '10px' : '4px' }} 16px 4px;font-size:{{ $last ? '15px' : '13px' }};color:{{ $last ? '#141414' : '#6B6560' }};font-weight:{{ $last ? '700' : '400' }};{{ $last ? 'border-top:1px dashed #E2DCD7;' : '' }}">{{ $totalLabel }}</td>
<td align="right" style="padding:{{ $last ? '10px' : '4px' }} 16px 4px;font-size:{{ $last ? '16px' : '13px' }};color:#141414;font-weight:{{ $last ? '800' : '500' }};white-space:nowrap;{{ $last ? 'border-top:1px dashed #E2DCD7;' : '' }}">{{ $totalValue }}</td>
</tr>
@endforeach
</table>
</td></tr>
@endif

@if (!empty($details))
{{-- Key facts --}}
<tr><td style="padding:14px 36px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAF8F6;border:1px solid #EEE9E5;border-radius:10px;">
@foreach ($details as $detailLabel => $detailValue)
<tr>
<td valign="top" style="padding:11px 16px;{{ $loop->first ? '' : 'border-top:1px solid #EEE9E5;' }}font-size:13px;color:#8A847F;width:38%;">{{ $detailLabel }}</td>
<td valign="top" style="padding:11px 16px;{{ $loop->first ? '' : 'border-top:1px solid #EEE9E5;' }}font-size:13px;color:#141414;font-weight:600;white-space:pre-line;">{{ $detailValue }}</td>
</tr>
@endforeach
</table>
</td></tr>
@endif

@if (!empty($actionUrl))
{{-- Call to action --}}
<tr><td style="padding:26px 36px 0;">
<table role="presentation" cellspacing="0" cellpadding="0"><tr>
<td bgcolor="#C0001A" style="border-radius:10px;mso-padding-alt:14px 26px;">
<a href="{{ $actionUrl }}" style="display:inline-block;padding:14px 26px;border-radius:10px;background-color:#C0001A;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">{{ $actionLabel }}&nbsp;&rarr;</a>
</td></tr></table>
<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#9A948F;">Button not working? Paste this link into your browser:<br><a href="{{ $actionUrl }}" style="color:#C0001A;word-break:break-all;">{{ $actionUrl }}</a></p>
</td></tr>
@endif

{{-- Sign-off --}}
<tr><td style="padding:26px 36px 32px;">
@if ($note)
<p style="margin:0 0 18px;font-size:13px;line-height:1.65;color:#6B6560;">{{ $note }}</p>
@endif
<p style="margin:0;font-size:14px;line-height:1.6;color:#141414;">With love,<br><strong>The Loved-IT Team</strong></p>
</td></tr>
</table>
</td></tr>

{{-- Footer: the theme's dark band --}}
<tr><td style="padding:22px 36px 26px;border-radius:0 0 14px 14px;background-color:#1A1A1A;">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#FFFFFF;">Loved-IT <span style="font-weight:400;color:#8C8580;">&middot; The General Marketplace</span></p>
<p style="margin:0;font-size:12px;line-height:1.65;color:#A39C97;">{{ $footer }}</p>
<p style="margin:10px 0 0;font-size:11px;color:#6F6863;">&copy; {{ date('Y') }} Loved-IT. All rights reserved.</p>
</td></tr>
</table>

</td></tr></table>
</body>
</html>
