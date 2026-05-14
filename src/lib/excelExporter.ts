import * as XLSX from 'xlsx';
import type { MatchResult } from '../types';

const MATCH_LABELS: Record<string, string> = {
  exact: 'Exact',
  fuzzy: 'Fuzzy',
  partial: 'Partial',
  no_match: 'No Match',
  service: 'Service — skipped',
};

const AI_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  uncertain: 'Uncertain',
};

export function exportResults(results: MatchResult[], filename = 'srs-match-results.xlsx'): void {
  const headers = [
    '#',
    'Product No',
    'Product ID (Zuper)',
    'Product Name',
    'Product Category',
    'Brand',
    'Description',
    'Price (Zuper)',
    'SRS Product ID',
    'SRS Product Name',
    'SRS Manufacturer',
    'SRS Category',
    'SRS Suggested Price',
    'Match Type',
    'Match Score %',
    'AI Verdict',
    'AI Reason',
  ];

  const rows = results.map((r, i) => [
    i + 1,
    r.zuper.productNo,
    r.zuper.productId,
    r.zuper.productName,
    r.zuper.productCategory,
    r.zuper.brand,
    r.zuper.productDescription,
    r.zuper.price,
    r.srs?.product_id ?? '',
    r.srs?.product_name ?? '',
    r.srs?.manufacturer ?? '',
    r.srs?.product_category ?? '',
    r.srs?.suggested_price ?? '',
    MATCH_LABELS[r.matchType],
    r.matchType !== 'no_match' ? `${Math.round(r.score * 100)}%` : '',
    r.aiVerdict ? AI_LABELS[r.aiVerdict] : '',
    r.aiReason ?? '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws['!cols'] = [
    { wch: 4 }, { wch: 12 }, { wch: 20 }, { wch: 45 }, { wch: 22 },
    { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 45 },
    { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 60 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SRS Match Results');
  XLSX.writeFile(wb, filename);
}
