import { useState } from 'react';
import type { MatchResult, MatchType } from '../types';
import { exportResults } from '../lib/excelExporter';

interface ResultsStepProps {
  results: MatchResult[];
  fileName: string;
  onReset: () => void;
}

type Tab = 'all' | MatchType;

const MATCH_LABEL: Record<MatchType, string> = {
  exact: 'Exact',
  fuzzy: 'Fuzzy',
  partial: 'Partial',
  no_match: 'No Match',
};

const MATCH_BADGE: Record<MatchType, string> = {
  exact: 'bg-green-50 text-green-700',
  fuzzy: 'bg-orange-50 text-orange-600',
  partial: 'bg-amber-50 text-amber-700',
  no_match: 'bg-gray-100 text-gray-500',
};

export default function ResultsStep({ results, fileName, onReset }: ResultsStepProps) {
  const [tab, setTab] = useState<Tab>('all');
  const [exporting, setExporting] = useState(false);

  const counts = {
    exact: results.filter((r) => r.matchType === 'exact').length,
    fuzzy: results.filter((r) => r.matchType === 'fuzzy').length,
    partial: results.filter((r) => r.matchType === 'partial').length,
    no_match: results.filter((r) => r.matchType === 'no_match').length,
  };

  const filtered = tab === 'all' ? results : results.filter((r) => r.matchType === tab);

  function handleExport() {
    setExporting(true);
    const base = fileName.replace(/\.[^/.]+$/, '');
    exportResults(results, `${base}-srs-matches.xlsx`);
    setTimeout(() => setExporting(false), 1200);
  }

  const statCards = [
    { label: 'Exact match', value: counts.exact, accent: 'border-green-400', text: 'text-green-600', tab: 'exact' as Tab },
    { label: 'Fuzzy match', value: counts.fuzzy, accent: 'border-orange-400', text: 'text-orange-600', tab: 'fuzzy' as Tab },
    { label: 'Partial match', value: counts.partial, accent: 'border-amber-400', text: 'text-amber-600', tab: 'partial' as Tab },
    { label: 'No match', value: counts.no_match, accent: 'border-gray-300', text: 'text-gray-500', tab: 'no_match' as Tab },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'exact', label: 'Exact', count: counts.exact },
    { key: 'fuzzy', label: 'Fuzzy', count: counts.fuzzy },
    { key: 'partial', label: 'Partial', count: counts.partial },
    { key: 'no_match', label: 'No Match', count: counts.no_match },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">
            Step 3 of 3
          </p>
          <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">Match results</h1>
          <p className="text-sm text-gray-500 leading-relaxed mt-1">
            {results.length.toLocaleString()} products processed from{' '}
            <span className="font-medium text-gray-600">{fileName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-8">
          <button
            onClick={onReset}
            className="h-10 px-5 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-sm"
          >
            ← New file
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="h-10 px-6 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-full transition-colors text-sm flex items-center gap-2"
          >
            {exporting ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Excel →
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map((c) => (
          <button
            key={c.tab}
            onClick={() => setTab(tab === c.tab ? 'all' : c.tab)}
            className={`bg-white rounded-2xl border-t-4 ${c.accent} border border-[#E5E2DC] p-4 text-left transition-all hover:shadow-sm ${tab === c.tab ? 'ring-2 ring-orange-200' : ''}`}
          >
            <p className={`text-3xl font-bold ${c.text}`}>{c.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
        <div className="border-b border-[#E5E2DC] px-5 py-3">
          <div className="flex gap-1 bg-[#F5F3F0] rounded-xl p-1 w-fit">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                  tab === t.key
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-orange-400' : 'text-gray-400'}`}>
                  {t.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F3F0] border-b border-[#E5E2DC]">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Zuper product
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Brand
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Match
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  SRS ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  SRS product name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  SRS manufacturer
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.zuper.rowNum}
                  className={`border-b border-[#E5E2DC] last:border-0 ${
                    i % 2 === 1 ? 'bg-[#F5F3F0]' : 'bg-white'
                  } ${r.matchType === 'no_match' ? 'opacity-60' : ''}`}
                >
                  <td className="px-5 py-3 max-w-[220px]">
                    <div>
                      <p className="font-medium text-[#1A1A1A] truncate" title={r.zuper.productName}>
                        {r.zuper.productName}
                      </p>
                      <p className="text-xs text-gray-400">{r.zuper.productId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate" title={r.zuper.productCategory}>
                    {r.zuper.productCategory}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {r.zuper.brand || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${MATCH_BADGE[r.matchType]}`}>
                      {MATCH_LABEL[r.matchType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                    {r.srs?.product_id ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-gray-600 truncate" title={r.srs?.product_name}>
                      {r.srs?.product_name ?? <span className="text-gray-300">—</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {r.srs?.manufacturer ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.matchType !== 'no_match' ? (
                      <span className="text-xs font-semibold text-gray-500">
                        {Math.round(r.score * 100)}%
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm">No results in this category.</div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-[#E5E2DC] px-5 py-3 bg-[#F5F3F0]">
            <p className="text-xs text-gray-400">
              Showing {filtered.length.toLocaleString()} of {results.length.toLocaleString()} products
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
