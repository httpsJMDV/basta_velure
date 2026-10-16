{!! $title !!}

Hi {!! $recipientName !!},

@foreach ($paragraphs as $paragraph)
{!! $paragraph !!}

@endforeach
@foreach ($details as $detailLabel => $detailValue)
{!! $detailLabel !!}: {!! $detailValue !!}

@endforeach
@if (!empty($actionUrl))
{!! $actionLabel !!}: {!! $actionUrl !!}

@endif
{!! $note !!}

The Loved-IT Team

{!! $footer !!}
