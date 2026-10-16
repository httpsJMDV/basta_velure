@php
$recipientName = $notice['recipientName'] ?? 'there';
$label = $notice['label'];
$title = $notice['title'];
$paragraphs = $notice['paragraphs'] ?? [];
$tone = $notice['tone'] ?? 'neutral';
$highlight = $notice['highlight'] ?? null;
$items = $notice['items'] ?? [];
$totals = $notice['totals'] ?? [];
$details = $notice['details'] ?? [];
$actionUrl = $notice['actionUrl'] ?? null;
$actionLabel = $notice['actionLabel'] ?? 'Open Loved-IT';
$note = $notice['note'] ?? null;
$footer = $notice['footer'] ?? 'You received this email because of activity on your Loved-IT account.';
$preview = $notice['preview'] ?? ($paragraphs[0] ?? $title);
@endphp
@include(!empty($plainText) ? 'emails.layouts.plain' : 'emails.layouts.branded')
