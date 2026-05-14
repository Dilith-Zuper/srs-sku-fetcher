import type { MatchResult } from '../types';

const MATCH_LABELS: Record<string, string> = {
  exact:    'Exact',
  fuzzy:    'Fuzzy',
  partial:  'Partial',
  no_match: 'No Match',
  service:  'Service — skipped',
};

const AI_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  rejected:  'Rejected',
  uncertain: 'Uncertain',
};

export async function exportResults(results: MatchResult[], filename = 'srs-match-results.xlsx'): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = [
    '#', 'Product No', 'Product ID (Zuper)', 'Product Name', 'Product Category',
    'Brand', 'Specification', 'Supplier (Zuper)', 'Price (Zuper)',
    'SRS Product ID', 'SRS Product Name', 'SRS Manufacturer', 'SRS Category',
    'SRS UOM', 'SRS Suggested Price',
    'Alt 1 SRS ID', 'Alt 1 SRS Name',
    'Alt 2 SRS ID', 'Alt 2 SRS Name',
    'Match Type', 'Match Score %',
    'AI Verdict', 'AI Reason', 'AI Status',
    'Manually Overridden',
  ];

  const rows = results.map((r, i) => {
    const alt1 = r.alternatives[0];
    const alt2 = r.alternatives[1];
    const aiStatus = r.aiError ? `Failed: ${r.aiError}` : (r.aiVerdict ? AI_LABELS[r.aiVerdict] : '');
    return [
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
      r.matchType !== 'no_match' && r.matchType !== 'service'
        ? `${Math.round(r.score * 100)}%`
        : '',
      r.aiVerdict ? AI_LABELS[r.aiVerdict] : '',
      r.aiReason ?? '',
      aiStatus,
      r.overridden ? 'Yes' : '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 4 }, { wch: 12 }, { wch: 20 }, { wch: 45 }, { wch: 22 },
    { wch: 15 }, { wch: 40 }, { wch: 22 }, { wch: 12 },
    { wch: 14 }, { wch: 45 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 45 }, { wch: 14 }, { wch: 45 },
    { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 60 }, { wch: 24 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SRS Match Results');
  XLSX.writeFile(wb, filename);
}
