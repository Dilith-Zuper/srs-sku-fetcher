import type ExcelJS from 'exceljs';
import type { MatchResult } from '../types';

// ARGB fill colors (FF prefix = fully opaque)
const C = {
  exact:           'FFD1FAE5',  // soft green
  fuzzy_confirmed: 'FFFFE8CC',  // soft peach/orange
  fuzzy_uncertain: 'FFFFF9C4',  // soft yellow
  fuzzy_error:     'FFFFD7D9',  // soft red
  partial:         'FFFEF3C7',  // soft amber
  no_match:        'FFEEEEEE',  // light gray
  service:         'FFE0F2FE',  // light blue
  header:          'FF1F2937',  // dark header
  subheader:       'FF374151',  // section header
  white:           'FFFFFFFF',
  orange:          'FFF97316',
  orange_light:    'FFFFF7ED',
  gray_text:       'FF6B7280',
} as const;

const MATCH_LABELS: Record<string, string> = {
  exact: 'Exact', fuzzy: 'Fuzzy', partial: 'Partial',
  no_match: 'No Match', service: 'Service — skipped',
};
const AI_LABELS: Record<string, string> = {
  confirmed: 'Confirmed', rejected: 'Rejected', uncertain: 'Uncertain',
};

function rowColor(r: MatchResult): string {
  if (r.matchType === 'service') return C.service;
  if (r.matchType === 'no_match') return C.no_match;
  if (r.matchType === 'partial') return C.partial;
  if (r.matchType === 'exact') return C.exact;
  if (r.aiError) return C.fuzzy_error;
  if (r.aiVerdict === 'confirmed') return C.fuzzy_confirmed;
  return C.fuzzy_uncertain;
}

function isReady(r: MatchResult) {
  return r.matchType === 'exact' ||
    (r.matchType === 'fuzzy' && r.aiVerdict === 'confirmed' && !r.aiError);
}

function needsReview(r: MatchResult) {
  return r.matchType === 'partial' ||
    (r.matchType === 'fuzzy' && (r.aiVerdict !== 'confirmed' || !!r.aiError)) ||
    !!r.overridden;
}

function deriveFilename(inputName: string): string {
  const base = inputName.replace(/\.[^.]+$/, '');
  const slug = base
    .replace(/[\s_-]*product[\s_-]*(export|report)[\s_-]*/gi, '_')
    .replace(/[\s_-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return `${slug || 'srs'}_srs_matches.xlsx`;
}

function pct(n: number, d: number) { return d > 0 ? `${Math.round((n / d) * 100)}%` : '—'; }

type WB = ExcelJS.Workbook;
type WS = ExcelJS.Worksheet;
type Row = ExcelJS.Row;

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleRow(row: Row, bgColor: string, opts: { bold?: boolean; fontColor?: string; size?: number } = {}) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = fill(bgColor);
    cell.font = { name: 'Calibri', size: opts.size ?? 10, bold: opts.bold ?? false, color: { argb: opts.fontColor ?? C.header } };
    cell.alignment = { vertical: 'middle' };
  });
}

function addHeader(ws: WS, cols: { header: string; width: number }[]) {
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const row = ws.addRow(cols.map(c => c.header));
  row.height = 22;
  styleRow(row, C.header, { bold: true, fontColor: C.white });
}

function addDataRow(ws: WS, values: (string | number | null | undefined)[], color: string) {
  const row = ws.addRow(values.map(v => v ?? ''));
  row.height = 18;
  styleRow(row, color);
  return row;
}

// ─── Sheet builders ────────────────────────────────────────────────────────────

function buildSummary(wb: WB, results: MatchResult[], inputFileName: string) {
  const ws = wb.addWorksheet('Summary');
  [30, 10, 16, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const exact    = results.filter(r => r.matchType === 'exact').length;
  const fuzzy    = results.filter(r => r.matchType === 'fuzzy').length;
  const partial  = results.filter(r => r.matchType === 'partial').length;
  const noMatch  = results.filter(r => r.matchType === 'no_match').length;
  const services = results.filter(r => r.matchType === 'service').length;
  const parts    = results.length - services;
  const confirmed = results.filter(r => r.aiVerdict === 'confirmed').length;
  const rejected  = results.filter(r => r.aiVerdict === 'rejected').length;
  const uncertain = results.filter(r => r.aiVerdict === 'uncertain').length;
  const errors    = results.filter(r => !!r.aiError).length;
  const ready     = results.filter(isReady).length;
  const review    = results.filter(needsReview).length;
  const overridden = results.filter(r => r.overridden).length;

  const addBlank = () => { ws.addRow([]); };
  const addSectionHdr = (title: string) => {
    addBlank();
    const row = ws.addRow([title, '', '', '']);
    ws.mergeCells(`A${row.number}:D${row.number}`);
    row.height = 20;
    styleRow(row, C.subheader, { bold: true, fontColor: C.white });
  };
  const addStat = (label: string, count: number | string, share: string, bg?: string) => {
    const row = ws.addRow([label, count, share, '']);
    row.height = 18;
    [1, 2, 3].forEach(n => {
      row.getCell(n).fill = fill(bg ?? C.white);
      row.getCell(n).font = { name: 'Calibri', size: 10, bold: n === 1 };
      row.getCell(n).alignment = { vertical: 'middle', horizontal: n > 1 ? 'center' : 'left' };
    });
  };

  // Title
  const titleRow = ws.addRow(['SRS SKU Fetcher — Match Results', '', '', '']);
  ws.mergeCells('A1:D1');
  titleRow.height = 36;
  titleRow.getCell(1).fill = fill(C.orange);
  titleRow.getCell(1).font = { name: 'Calibri', size: 18, bold: true, color: { argb: C.white } };
  titleRow.getCell(1).alignment = { vertical: 'middle' };

  // Subtitle
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subRow = ws.addRow([`Generated ${date}   ·   Input: ${inputFileName}`, '', '', '']);
  ws.mergeCells(`A2:D2`);
  subRow.height = 20;
  subRow.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: C.gray_text } };
  subRow.getCell(1).alignment = { vertical: 'middle' };

  addBlank();

  // Column labels
  const hdrRow = ws.addRow(['Category', 'Count', 'Of parts', '']);
  hdrRow.height = 20;
  [1, 2, 3].forEach(n => {
    hdrRow.getCell(n).fill = fill(C.header);
    hdrRow.getCell(n).font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
    hdrRow.getCell(n).alignment = { vertical: 'middle', horizontal: n > 1 ? 'center' : 'left' };
  });

  addStat('Total products', results.length, '—');
  addStat('Services (skipped)', services, '—', C.service);
  addStat('Parts to match', parts, '100%');

  addSectionHdr('MATCH BREAKDOWN');
  addStat('Exact match', exact,   pct(exact,   parts), C.exact);
  addStat('Fuzzy match', fuzzy,   pct(fuzzy,   parts), C.fuzzy_confirmed);
  addStat('Partial match', partial, pct(partial, parts), C.partial);
  addStat('No match', noMatch,    pct(noMatch, parts), C.no_match);

  addSectionHdr('AI VERIFICATION');
  addStat('AI confirmed', confirmed, '—', C.exact);
  addStat('AI rejected → No Match', rejected, '—', C.fuzzy_error);
  addStat('AI uncertain', uncertain, '—', C.fuzzy_uncertain);
  addStat('AI errors (review manually)', errors, '—', C.fuzzy_error);

  addSectionHdr('ACTION REQUIRED');
  addStat('Ready to use', ready, pct(ready, parts), C.exact);
  addStat('Needs review', review, pct(review, parts), C.partial);
  addStat('Manually overridden', overridden, '—', C.fuzzy_confirmed);

  addSectionHdr('COLOR LEGEND');
  const legend: [string, string, string][] = [
    [C.exact,           'Exact match',          'High confidence — ready to use'],
    [C.fuzzy_confirmed, 'Fuzzy / AI confirmed', 'Good match confirmed by Claude — ready to use'],
    [C.fuzzy_uncertain, 'Fuzzy / AI uncertain', 'Good match, Claude unsure — review recommended'],
    [C.partial,         'Partial match',         'Weaker match — human review required'],
    [C.fuzzy_error,     'AI error',              'Claude verification failed — SQL match stands, review manually'],
    [C.no_match,        'No match',              'No SRS product found above 30% threshold'],
    [C.service,         'Service (skipped)',      'SRS catalog has parts only — not sent to matcher'],
  ];
  for (const [color, label, desc] of legend) {
    const row = ws.addRow([label, '', desc, '']);
    row.height = 18;
    row.getCell(1).fill = fill(color);
    row.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(3).font = { name: 'Calibri', size: 10, color: { argb: C.gray_text } };
    row.getCell(3).alignment = { vertical: 'middle' };
  }
}

function buildReadyToUse(wb: WB, results: MatchResult[]) {
  const ws = wb.addWorksheet('Ready to Use');
  const cols = [
    { header: '#',              width: 5  },
    { header: 'Product No',     width: 12 },
    { header: 'Product ID',     width: 20 },
    { header: 'Product Name',   width: 45 },
    { header: 'Category',       width: 22 },
    { header: 'Brand',          width: 15 },
    { header: 'SRS ID',         width: 14 },
    { header: 'SRS Name',       width: 45 },
    { header: 'SRS Manufacturer', width: 22 },
    { header: 'SRS UOM',        width: 12 },
    { header: 'SRS Price',      width: 12 },
    { header: 'Match Type',     width: 12 },
    { header: 'Score',          width: 8  },
    { header: 'AI Verdict',     width: 12 },
  ];
  addHeader(ws, cols);
  const rows = results.filter(isReady);
  rows.forEach((r, i) => {
    addDataRow(ws, [
      i + 1,
      r.zuper.productNo,
      r.zuper.productId,
      r.zuper.productName,
      r.zuper.productCategory,
      r.zuper.brand,
      r.srs?.product_id ?? '',
      r.srs?.product_name ?? '',
      r.srs?.manufacturer ?? '',
      r.srs?.product_uom?.join(', ') ?? '',
      r.srs?.suggested_price ?? '',
      MATCH_LABELS[r.matchType],
      r.matchType !== 'no_match' ? `${Math.round(r.score * 100)}%` : '',
      r.aiVerdict ? AI_LABELS[r.aiVerdict] : '—',
    ], rowColor(r));
  });
}

function buildNeedsReview(wb: WB, results: MatchResult[]) {
  const ws = wb.addWorksheet('Needs Review');
  const cols = [
    { header: '#',            width: 5  },
    { header: 'Product No',   width: 12 },
    { header: 'Product Name', width: 40 },
    { header: 'Brand',        width: 15 },
    { header: 'Specification',width: 40 },
    { header: 'SRS ID',       width: 14 },
    { header: 'SRS Name',     width: 40 },
    { header: 'SRS Manufacturer', width: 20 },
    { header: 'SRS UOM',      width: 12 },
    { header: 'Match Type',   width: 12 },
    { header: 'Score',        width: 8  },
    { header: 'AI Verdict',   width: 12 },
    { header: 'AI Reason',    width: 60 },
    { header: 'Alt 1 ID',     width: 12 },
    { header: 'Alt 1 Name',   width: 35 },
    { header: 'Alt 2 ID',     width: 12 },
    { header: 'Alt 2 Name',   width: 35 },
  ];
  addHeader(ws, cols);
  const rows = results.filter(needsReview);
  rows.forEach((r, i) => {
    const row = addDataRow(ws, [
      i + 1,
      r.zuper.productNo,
      r.zuper.productName,
      r.zuper.brand,
      r.zuper.productDescription,
      r.srs?.product_id ?? '',
      r.srs?.product_name ?? '',
      r.srs?.manufacturer ?? '',
      r.srs?.product_uom?.join(', ') ?? '',
      MATCH_LABELS[r.matchType],
      r.matchType !== 'no_match' ? `${Math.round(r.score * 100)}%` : '',
      r.aiError ? 'Error' : (r.aiVerdict ? AI_LABELS[r.aiVerdict] : '—'),
      r.aiError ?? r.aiReason ?? '',
      r.alternatives[0]?.product_id ?? '',
      r.alternatives[0]?.product_name ?? '',
      r.alternatives[1]?.product_id ?? '',
      r.alternatives[1]?.product_name ?? '',
    ], rowColor(r));
    // Wrap AI Reason column
    row.getCell(13).alignment = { wrapText: true, vertical: 'top' };
    if (r.aiReason || r.aiError) row.height = 36;
  });
}

function buildNoMatch(wb: WB, results: MatchResult[]) {
  const ws = wb.addWorksheet('No Match');
  const cols = [
    { header: '#',             width: 5  },
    { header: 'Product No',    width: 12 },
    { header: 'Product ID',    width: 20 },
    { header: 'Product Name',  width: 45 },
    { header: 'Category',      width: 22 },
    { header: 'Brand',         width: 15 },
    { header: 'Specification', width: 45 },
    { header: 'Supplier',      width: 22 },
  ];
  addHeader(ws, cols);
  results.filter(r => r.matchType === 'no_match').forEach((r, i) => {
    addDataRow(ws, [
      i + 1,
      r.zuper.productNo,
      r.zuper.productId,
      r.zuper.productName,
      r.zuper.productCategory,
      r.zuper.brand,
      r.zuper.productDescription,
      r.zuper.supplier,
    ], C.no_match);
  });
}

function buildAllResults(wb: WB, results: MatchResult[]) {
  const ws = wb.addWorksheet('All Results');
  const cols = [
    { header: '#',                  width: 4  },
    { header: 'Product No',         width: 12 },
    { header: 'Product ID (Zuper)', width: 20 },
    { header: 'Product Name',       width: 42 },
    { header: 'Category',           width: 22 },
    { header: 'Brand',              width: 15 },
    { header: 'Specification',      width: 38 },
    { header: 'Supplier (Zuper)',   width: 20 },
    { header: 'Price (Zuper)',      width: 12 },
    { header: 'SRS Product ID',     width: 14 },
    { header: 'SRS Product Name',   width: 42 },
    { header: 'SRS Manufacturer',   width: 20 },
    { header: 'SRS Category',       width: 20 },
    { header: 'SRS UOM',            width: 12 },
    { header: 'SRS Suggested Price',width: 16 },
    { header: 'Alt 1 SRS ID',       width: 12 },
    { header: 'Alt 1 SRS Name',     width: 38 },
    { header: 'Alt 2 SRS ID',       width: 12 },
    { header: 'Alt 2 SRS Name',     width: 38 },
    { header: 'Match Type',         width: 14 },
    { header: 'Match Score %',      width: 12 },
    { header: 'AI Verdict',         width: 12 },
    { header: 'AI Reason',          width: 55 },
    { header: 'AI Status',          width: 22 },
    { header: 'Overridden',         width: 10 },
  ];
  addHeader(ws, cols);
  results.forEach((r, i) => {
    const alt1 = r.alternatives[0];
    const alt2 = r.alternatives[1];
    const aiStatus = r.aiError ? `Failed: ${r.aiError}` : (r.aiVerdict ? AI_LABELS[r.aiVerdict] : '');
    addDataRow(ws, [
      i + 1,
      r.zuper.productNo,
      r.zuper.productId,
      r.zuper.productName,
      r.zuper.productCategory,
      r.zuper.brand,
      r.zuper.productDescription,
      r.zuper.supplier,
      r.zuper.price,
      r.srs?.product_id ?? '',
      r.srs?.product_name ?? '',
      r.srs?.manufacturer ?? '',
      r.srs?.product_category ?? '',
      r.srs?.product_uom?.join(', ') ?? '',
      r.srs?.suggested_price ?? '',
      alt1?.product_id ?? '',
      alt1?.product_name ?? '',
      alt2?.product_id ?? '',
      alt2?.product_name ?? '',
      MATCH_LABELS[r.matchType] ?? r.matchType,
      r.matchType !== 'no_match' && r.matchType !== 'service' ? `${Math.round(r.score * 100)}%` : '',
      r.aiVerdict ? AI_LABELS[r.aiVerdict] : '',
      r.aiReason ?? '',
      aiStatus,
      r.overridden ? 'Yes' : '',
    ], rowColor(r));
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function exportResults(results: MatchResult[], inputFileName = 'export.xlsx'): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SRS SKU Fetcher · Zuper Internal Tools';
  wb.created = new Date();
  wb.modified = new Date();

  buildSummary(wb, results, inputFileName);
  buildReadyToUse(wb, results);
  buildNeedsReview(wb, results);
  buildNoMatch(wb, results);
  buildAllResults(wb, results);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = deriveFilename(inputFileName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
