{!! strtoupper($label) !!}
{!! $title !!}

Hi {!! $recipientName !!},

@foreach ($paragraphs as $paragraph)
{!! $paragraph !!}

@endforeach
@if (!empty($highlight))
{!! $highlight['title'] !!}:
{!! $highlight['body'] !!}

@endif
@foreach (($items ?? []) as $item)
- {!! $item['name'] !!}{!! !empty($item['meta']) ? ' (' . $item['meta'] . ')' : '' !!}{!! !empty($item['amount']) ? ': ' . $item['amount'] : '' !!}
@endforeach
@if (!empty($items))

@endif
@foreach (($totals ?? []) as $totalLabel => $totalValue)
{!! $totalLabel !!}: {!! $totalValue !!}
@endforeach
@if (!empty($totals))

@endif
@foreach (($details ?? []) as $detailLabel => $detailValue)
{!! $detailLabel !!}: {!! $detailValue !!}
@endforeach
@if (!empty($details))

@endif
@if (!empty($actionUrl))
{!! $actionLabel !!}: {!! $actionUrl !!}

@endif
@if (!empty($note))
{!! $note !!}

@endif
With love,
The Loved-IT Team

{!! $footer !!}
