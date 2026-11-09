<?php

namespace App\Services\Reports;

use App\Support\PdfReport;
use App\Support\XlsxWorkbook;
use Carbon\CarbonImmutable;

/**
 * One report (a hub's, a courier network's or a rider's) built once and given three ways: as JSON for the report
 * screens, as an Excel workbook and as an A4 PDF. The three always show the same figures because they are the same
 * object. See docs/api/logistics-rider-reports.md.
 *
 * Cell types: text, int, money (pesos), percent (a share from 0 to 1, or null), hours (or null), date (Y-m-d) and
 * datetime (ISO 8601).
 */
final class ReportDocument
{
    public const TZ = 'Asia/Manila';

    /** At most this many rows of a table go to the screens; the files have them all. */
    public const PREVIEW_ROWS = 100;

    /** @var list<array{label: string, type: string, value: mixed, hint: ?string}> */
    private array $kpis = [];

    /** @var list<array{title: string, columns: list<array{label: string, type: string, w: float}>, rows: list<list<mixed>>, total: ?list<mixed>, note: ?string, empty: string}> */
    private array $sections = [];

    /** @var list<string> */
    private array $notes = [];

    /**
     * @param  string  $kind  hub, courier or rider
     * @param  array{from: string, to: string, days: int}  $range  inclusive Manila days
     */
    public function __construct(
        public readonly string $kind,
        public readonly string $title,
        public readonly string $owner,
        public readonly array $range,
    ) {
    }

    public function kpi(string $label, string $type, mixed $value, ?string $hint = null): self
    {
        $this->kpis[] = ['label' => $label, 'type' => $type, 'value' => $value, 'hint' => $hint];

        return $this;
    }

    /**
     * @param  list<array{0: string, 1: string, 2?: float}>  $columns  label, type and relative width
     * @param  list<list<mixed>>  $rows
     * @param  list<mixed>|null  $total
     */
    public function section(string $title, array $columns, array $rows, ?array $total = null, ?string $note = null, string $empty = 'Nothing in this period.'): self
    {
        $this->sections[] = [
            'title'   => $title,
            'columns' => array_map(fn (array $c) => ['label' => $c[0], 'type' => $c[1], 'w' => (float) ($c[2] ?? 1)], $columns),
            'rows'    => array_values($rows),
            'total'   => $total,
            'note'    => $note,
            'empty'   => $empty,
        ];

        return $this;
    }

    public function note(string $text): self
    {
        $this->notes[] = $text;

        return $this;
    }

    public function periodLabel(): string
    {
        $from = CarbonImmutable::createFromFormat('Y-m-d', $this->range['from'], self::TZ);
        $to = CarbonImmutable::createFromFormat('Y-m-d', $this->range['to'], self::TZ);
        if ($from->isSameDay($to)) {
            return $from->format('M j, Y');
        }

        return $from->year === $to->year
            ? $from->format('M j') . ' to ' . $to->format('M j, Y')
            : $from->format('M j, Y') . ' to ' . $to->format('M j, Y');
    }

    public function filename(string $extension): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($this->kind . '-report-' . $this->owner)), '-');

        return mb_substr($slug, 0, 80) . "-{$this->range['from']}_to_{$this->range['to']}.{$extension}";
    }

    // ── Values ────────────────────────────────────────────────────────────────

    /** A label in a total row ("Total", "12 jobs") reads as text whatever its column holds. */
    public static function typeOf(string $type, mixed $value): string
    {
        if (! is_string($value) || $type === 'text') {
            return $type;
        }
        $fits = in_array($type, ['date', 'datetime'], true) ? (bool) preg_match('/^\d{4}-\d{2}-\d{2}/', $value) : is_numeric($value);

        return $fits ? $type : 'text';
    }

    /** How a value reads on a screen or in the PDF. */
    public static function display(string $type, mixed $value): string
    {
        $type = self::typeOf($type, $value);
        if ($value === null || $value === '') {
            return $type === 'text' ? '' : '—';
        }

        return match ($type) {
            'int'      => number_format((int) $value),
            'money'    => '₱' . number_format((float) $value, 2),
            'percent'  => round((float) $value * 100) . '%',
            'hours'    => rtrim(rtrim(number_format((float) $value, 1), '0'), '.') . ' h',
            'date'     => CarbonImmutable::parse((string) $value, self::TZ)->format('M j, Y'),
            'datetime' => CarbonImmutable::parse((string) $value)->setTimezone(self::TZ)->format('M j, Y g:i A'),
            default    => (string) $value,
        };
    }

    // ── JSON ──────────────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'kind'     => $this->kind,
            'title'    => $this->title,
            'owner'    => $this->owner,
            'range'    => ['from' => $this->range['from'], 'to' => $this->range['to'], 'days' => $this->range['days'], 'label' => $this->periodLabel(), 'timezone' => self::TZ],
            'made_at'  => now(self::TZ)->toIso8601String(),
            'kpis'     => array_map(fn (array $k) => $k + ['display' => self::display($k['type'], $k['value'])], $this->kpis),
            'sections' => array_map(fn (array $s) => [
                'title'      => $s['title'],
                'columns'    => array_map(fn ($c) => ['label' => $c['label'], 'type' => $c['type']], $s['columns']),
                'rows'       => array_slice($s['rows'], 0, self::PREVIEW_ROWS),
                'total_rows' => count($s['rows']),
                'total'      => $s['total'],
                'note'       => $s['note'],
                'empty'      => $s['empty'],
            ], $this->sections),
            'notes'    => $this->notes,
        ];
    }

    // ── Excel ─────────────────────────────────────────────────────────────────

    public function xlsx(): string
    {
        $x = new XlsxWorkbook("{$this->owner} {$this->title}", 'Loved-IT');
        $heading = fn (string $title) => [
            [XlsxWorkbook::text($title, 'title')],
            [XlsxWorkbook::text("{$this->owner} · {$this->periodLabel()} · Philippine time", 'muted')],
            [XlsxWorkbook::text('Made on Loved-IT ' . now(self::TZ)->format('M j, Y g:i A'), 'muted')],
            [],
        ];

        $summary = [
            ...$heading($this->title),
            [XlsxWorkbook::header('Figure'), XlsxWorkbook::header('Value'), XlsxWorkbook::header('What it means')],
        ];
        foreach ($this->kpis as $k) {
            $summary[] = [XlsxWorkbook::text($k['label'], 'label'), $this->xlsxCell($k['type'], $k['value']), (string) $k['hint']];
        }
        if ($this->notes !== []) {
            $summary[] = [];
            foreach ($this->notes as $n) {
                $summary[] = [XlsxWorkbook::text($n, 'muted')];
            }
        }
        $x->sheet('Summary', [34, 20, 70], $summary);

        $used = ['Summary' => true];
        foreach ($this->sections as $s) {
            $name = mb_substr($s['title'], 0, 31);
            for ($i = 2; isset($used[$name]); $i++) {
                $name = mb_substr($s['title'], 0, 28) . " {$i}";
            }
            $used[$name] = true;

            $rows = [...$heading($s['title']), array_map(fn ($c) => XlsxWorkbook::header($c['label']), $s['columns'])];
            foreach ($s['rows'] as $row) {
                $rows[] = array_map(fn ($c, $v) => $this->xlsxCell($c['type'], $v), $s['columns'], $row);
            }
            if ($s['rows'] === []) {
                $rows[] = [XlsxWorkbook::text($s['empty'], 'muted')];
            }
            if ($s['total'] && $s['rows'] !== []) {
                $rows[] = array_map(fn ($c, $v) => $this->xlsxCell($c['type'], $v, true), $s['columns'], $s['total']);
            }
            if ($s['note']) {
                $rows[] = [];
                $rows[] = [XlsxWorkbook::text($s['note'], 'muted')];
            }
            $widths = array_map(fn ($c) => match ($c['type']) {
                'text'     => max(16, 14 * $c['w']),
                'datetime' => 22,
                'date'     => 16,
                'money'    => 18,
                default    => max(12, mb_strlen($c['label']) + 4),
            }, $s['columns']);
            $x->sheet($name, $widths, $rows, 5);
        }

        return $x->bytes();
    }

    private function xlsxCell(string $type, mixed $value, bool $total = false): mixed
    {
        $type = self::typeOf($type, $value);
        if ($value === null) {
            return XlsxWorkbook::text('', $total ? 'total' : 'default');
        }

        return match ($type) {
            'int'      => XlsxWorkbook::int((int) $value, $total),
            'money'    => XlsxWorkbook::money((float) $value, $total),
            'percent'  => XlsxWorkbook::percent((float) $value, $total),
            'hours'    => $total ? XlsxWorkbook::text(self::display('hours', $value), 'total') : round((float) $value, 2),
            'date'     => XlsxWorkbook::date(CarbonImmutable::parse((string) $value, self::TZ)),
            'datetime' => XlsxWorkbook::date(CarbonImmutable::parse((string) $value)->setTimezone(self::TZ), true),
            default    => XlsxWorkbook::text((string) $value, $total ? 'total' : 'default'),
        };
    }

    // ── PDF ───────────────────────────────────────────────────────────────────

    private const INK = [0.118, 0.106, 0.094];
    private const MUTED = [0.471, 0.443, 0.424];
    private const SOFT = [0.341, 0.325, 0.306];
    private const RULE = [0.906, 0.898, 0.894];
    private const BRAND = [0.753, 0.0, 0.102];
    private const TINT = [0.98, 0.973, 0.961];
    private const HEAD = [0.961, 0.961, 0.957];

    /** Columns that line up on the right. */
    private const NUMERIC = ['int', 'money', 'percent', 'hours'];

    private const LEFT = 40.0;
    private const RIGHT = PdfReport::WIDTH - 40.0;
    private const BOTTOM = PdfReport::HEIGHT - 52.0;

    public function pdf(): string
    {
        $pdf = new PdfReport("{$this->owner} {$this->title}", 'Loved-IT');
        $width = self::RIGHT - self::LEFT;
        $pdf->addPage();

        // The first page's heading.
        $pdf->text(self::LEFT, 50, 'Loved-IT', 15, true, self::BRAND);
        $pdf->text(self::RIGHT, 50, 'Made ' . now(self::TZ)->format('M j, Y g:i A'), 8, false, self::MUTED, 'right');
        $pdf->line(self::LEFT, 62, self::RIGHT, 62, self::RULE);
        $pdf->text(self::LEFT, 94, $this->title, 21, true, self::INK);
        $pdf->text(self::LEFT, 113, PdfReport::fit($this->owner, $width, 11), 11, false, self::SOFT);
        $pdf->text(self::LEFT, 128, $this->periodLabel() . ' · Philippine time', 9, false, self::MUTED);
        $y = 146.0;

        // Key figures, four to a row.
        $cols = 4;
        $gap = 8.0;
        $boxW = ($width - $gap * ($cols - 1)) / $cols;
        foreach (array_chunk($this->kpis, $cols) as $chunk) {
            foreach ($chunk as $i => $k) {
                $x = self::LEFT + $i * ($boxW + $gap);
                $pdf->rect($x, $y, $boxW, 54, self::TINT, self::RULE);
                $pdf->text($x + 9, $y + 15, PdfReport::fit(strtoupper($k['label']), $boxW - 18, 6.8, true), 6.8, true, self::MUTED);
                $pdf->text($x + 9, $y + 35, PdfReport::fit(self::display($k['type'], $k['value']), $boxW - 18, 14.5, true), 14.5, true, self::INK);
                if ($k['hint']) {
                    $pdf->text($x + 9, $y + 47, PdfReport::fit($k['hint'], $boxW - 18, 6.8), 6.8, false, self::MUTED);
                }
            }
            $y += 54 + $gap;
        }
        $y += 10;

        foreach ($this->sections as $s) {
            $y = $this->pdfTable($pdf, $s, $y);
        }

        if ($this->notes !== []) {
            $y = $this->room($pdf, $y, 20 + 12 * count($this->notes));
            $pdf->text(self::LEFT, $y + 10, 'Notes', 9.5, true, self::INK);
            $y += 24;
            foreach ($this->notes as $n) {
                foreach ($this->wrap($n, $width, 8) as $line) {
                    $y = $this->room($pdf, $y, 12);
                    $pdf->text(self::LEFT, $y, $line, 8, false, self::MUTED);
                    $y += 11;
                }
            }
        }

        // Footers, now that the number of pages is known.
        $pages = $pdf->pageCount();
        for ($p = 0; $p < $pages; $p++) {
            $pdf->onPage($p);
            $pdf->line(self::LEFT, PdfReport::HEIGHT - 38, self::RIGHT, PdfReport::HEIGHT - 38, self::RULE);
            $pdf->text(self::LEFT, PdfReport::HEIGHT - 26, PdfReport::fit("Loved-IT · {$this->title} · {$this->owner}", $width - 80, 7.5), 7.5, false, self::MUTED);
            $pdf->text(self::RIGHT, PdfReport::HEIGHT - 26, 'Page ' . ($p + 1) . ' of ' . $pages, 7.5, false, self::MUTED, 'right');
        }

        return $pdf->bytes();
    }

    /** @param array<string, mixed> $s */
    private function pdfTable(PdfReport $pdf, array $s, float $y): float
    {
        $width = self::RIGHT - self::LEFT;
        $weights = array_sum(array_column($s['columns'], 'w')) ?: 1;
        $widths = array_map(fn ($c) => $width * $c['w'] / $weights, $s['columns']);
        $rowH = 17.0;

        $header = function (float $y) use ($pdf, $s, $widths, $rowH): float {
            $pdf->rect(self::LEFT, $y, self::RIGHT - self::LEFT, $rowH + 1, self::HEAD);
            $x = self::LEFT;
            foreach ($s['columns'] as $i => $c) {
                $numeric = in_array($c['type'], self::NUMERIC, true);
                $label = PdfReport::fit($c['label'], $widths[$i] - 10, 7.6, true);
                $pdf->text($numeric ? $x + $widths[$i] - 5 : $x + 5, $y + 12, $label, 7.6, true, self::SOFT, $numeric ? 'right' : 'left');
                $x += $widths[$i];
            }

            return $y + $rowH + 1;
        };

        $row = function (float $y, array $values, bool $total) use ($pdf, $s, $widths, $rowH): float {
            $x = self::LEFT;
            foreach ($s['columns'] as $i => $c) {
                $numeric = in_array(self::typeOf($c['type'], $values[$i] ?? null), self::NUMERIC, true);
                $text = PdfReport::fit(self::display($c['type'], $values[$i] ?? null), $widths[$i] - 10, 8.2, $total);
                $pdf->text($numeric ? $x + $widths[$i] - 5 : $x + 5, $y + 12, $text, 8.2, $total, $total ? self::INK : self::SOFT, $numeric ? 'right' : 'left');
                $x += $widths[$i];
            }
            $pdf->line(self::LEFT, $y + $rowH, self::RIGHT, $y + $rowH, $total ? self::INK : self::RULE, $total ? 0.9 : 0.5);

            return $y + $rowH;
        };

        // The title stays with the header and the first rows.
        $y = $this->room($pdf, $y, 30 + 18 + $rowH * min(3, max(1, count($s['rows']))));
        $pdf->text(self::LEFT, $y + 12, $s['title'], 11.5, true, self::INK);
        if ($s['rows'] !== []) {
            $pdf->text(self::RIGHT, $y + 12, number_format(count($s['rows'])) . (count($s['rows']) === 1 ? ' row' : ' rows'), 7.5, false, self::MUTED, 'right');
        }
        $y += 22;
        $y = $header($y);

        if ($s['rows'] === []) {
            $pdf->text(self::LEFT + 5, $y + 14, $s['empty'], 8.2, false, self::MUTED);
            $y += 22;
        }
        foreach ($s['rows'] as $values) {
            if ($y + $rowH > self::BOTTOM) {
                $y = $this->continued($pdf, $s['title']);
                $y = $header($y);
            }
            $y = $row($y, $values, false);
        }
        if ($s['total'] && $s['rows'] !== []) {
            if ($y + $rowH > self::BOTTOM) {
                $y = $header($this->continued($pdf, $s['title']));
            }
            $pdf->line(self::LEFT, $y, self::RIGHT, $y, self::INK, 0.9);
            $y = $row($y, $s['total'], true);
        }
        if ($s['note']) {
            foreach ($this->wrap($s['note'], self::RIGHT - self::LEFT, 7.6) as $line) {
                $y = $this->room($pdf, $y, 12);
                $pdf->text(self::LEFT, $y + 12, $line, 7.6, false, self::MUTED);
                $y += 11;
            }
        }

        return $y + 22;
    }

    /** A new page when [needed] points don't fit on this one. Returns where to write. */
    private function room(PdfReport $pdf, float $y, float $needed): float
    {
        if ($y + $needed <= self::BOTTOM) {
            return $y;
        }
        $pdf->addPage();

        return 48.0;
    }

    /** A new page for a table that goes on, with its name at the top. */
    private function continued(PdfReport $pdf, string $title): float
    {
        $pdf->addPage();
        $pdf->text(self::LEFT, 46, $title . ' (continued)', 9.5, true, self::INK);

        return 58.0;
    }

    /** @return list<string> lines of at most [width] points */
    private function wrap(string $text, float $width, float $size): array
    {
        $lines = [];
        $line = '';
        foreach (preg_split('/\s+/', trim($text)) ?: [] as $word) {
            $try = $line === '' ? $word : "{$line} {$word}";
            if ($line !== '' && PdfReport::width($try, $size) > $width) {
                $lines[] = $line;
                $line = $word;
            } else {
                $line = $try;
            }
        }
        if ($line !== '') {
            $lines[] = $line;
        }

        return $lines;
    }
}
