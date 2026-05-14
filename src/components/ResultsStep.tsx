import { useState } from 'react';
import type { MatchResult, MatchType, AiVerdict, SrsProduct } from '../types';
import { exportResults } from '../lib/excelExporter';
import { MATCHING } from '../lib/config';

interface ResultsStepProps {
  results: MatchResult[];
  fileName: string;
  onReset: () => void;
}

type Tab = 'all' | MatchType | 'verified' | 'errors';

const MATCH_LABEL: Record<MatchType, string> = {
  exact: 'Exact', fuzzy: 'Fuzzy', partial: 'Partial', no_match: 'No Match', service: 'Service',
};

const MATCH_BADGE: Record<MatchType, string> = {
  exact:   'bg-green-50 text-green-700',
  fuzzy:   'bg-orange-50 text-orange-600',
  partial: 'bg-amber-50 text-amber-700',
  no_match:'bg-gray-100 text-gray-500',
  service: 'bg-blue-50 text-blue-600',
};

const AI_BADGE: Record<AiVerdict, { cls: string; label: string }> = {
  confirmed: { cls: 'bg-green-50 text-green-700', label: 'AI ✓' },
  rejected:  { cls: 'bg-red-50 text-red-600',     label: 'AI ✗' },
  uncertain: { cls: 'bg-gray-100 text-gray-500',  label: 'AI ?' },
};

export default function ResultsStep({ results: initial, fileName, onReset }: ResultsStepProps) {
  const [results, setResults] = useState<MatchResult[]>(initial);
  const [tab, setTab] = useState<Tab>('all');
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggleExpanded(rowNum: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(rowNum) ? next.delete(rowNum) : next.add(rowNum);
      return next;
    });
  }

  function promoteAlternative(rowNum: number, altIdx: number) {
    setResults(prev => prev.map(r => {
      if (r.zuper.rowNum !== rowNum || !r.alternatives[altIdx]) return r;
      const newTop = r.alternatives[altIdx];
      const oldTop = r.srs;
      const others = r.alternatives.filter((_, i) => i !== altIdx);
      const newAlts = oldTop ? [oldTop, ...others] : others;
      // Set the override type based on actual score; user override means we trust their pick
      const newType: MatchType =
        r.matchType === 'no_match' || r.matchType === 'service' ? 'fuzzy' : r.matchType;
      return { ...r, srs: newTop, alternatives: newAlts, matchType: newType, overridden: true };
    }));
  }

  function markNoMatch(rowNum: number) {
    setResults(prev => prev.map(r =>
      r.zuper.rowNum === rowNum
        ? { ...r, srs: null, matchType: 'no_match', overridden: true }
        : r
    ));
  }

  const counts = {
    exact:    results.filter(r => r.matchType === 'exact').length,
    fuzzy:    results.filter(r => r.matchType === 'fuzzy').length,
    partial:  results.filter(r => r.matchType === 'partial').length,
    no_match: results.filter(r => r.matchType === 'no_match').length,
    service:  results.filter(r => r.matchType === 'service').length,
    verified: results.filter(r => r.aiVerdict === 'confirmed').length,
    errors:   results.filter(r => !!r.aiError).length,
    overridden: results.filter(r => r.overridden).length,
  };

  const confirmed = {
    fuzzy:   results.filter(r => r.matchType === 'fuzzy'   && r.aiVerdict === 'confirmed').length,
    partial: results.filter(r => r.matchType === 'partial' && r.aiVerdict === 'confirmed').length,
  };

  const filtered = (() => {
    if (tab === 'all')      return results;
    if (tab === 'verified') return results.filter(r => r.aiVerdict === 'confirmed');
    if (tab === 'errors')   return results.filter(r => !!r.aiError);
    return results.filter(r => r.matchType === tab);
  })();

  async function handleExport() {
    setExporting(true);
    await exportResults(results, fileName);
    setTimeout(() => setExporting(false), 1000);
  }

  const statCards = [
    { label: 'Exact',   value: counts.exact,   accent: 'border-green-400',  text: 'text-green-600',  sub: null, tab: 'exact' as Tab },
    { label: 'Fuzzy',   value: counts.fuzzy,   accent: 'border-orange-400', text: 'text-orange-600', sub: confirmed.fuzzy   > 0 ? `${confirmed.fuzzy} AI confirmed`   : null, tab: 'fuzzy' as Tab },
    { label: 'Partial', value: counts.partial, accent: 'border-amber-400',  text: 'text-amber-600',  sub: confirmed.partial > 0 ? `${confirmed.partial} AI confirmed` : null, tab: 'partial' as Tab },
    { label: 'No match',value: counts.no_match,accent: 'border-gray-300',   text: 'text-gray-500',   sub: null, tab: 'no_match' as Tab },
    { label: 'Services',value: counts.service, accent: 'border-blue-300',   text: 'text-blue-500',   sub: 'skipped', tab: 'service' as Tab },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: results.length },
    { key: 'exact',    label: 'Exact',    count: counts.exact },
    { key: 'fuzzy',    label: 'Fuzzy',    count: counts.fuzzy },
    { key: 'partial',  label: 'Partial',  count: counts.partial },
    { key: 'no_match', label: 'No Match', count: counts.no_match },
    { key: 'service',  label: 'Services', count: counts.service },
    { key: 'verified', label: 'Verified', count: counts.verified },
    ...(counts.errors > 0 ? [{ key: 'errors' as Tab, label: 'AI Errors', count: counts.errors }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Step 3 of 3</p>
          <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">Match results</h1>
          <p className="text-sm text-gray-500 leading-relaxed mt-1">
            {results.length.toLocaleString()} products from <span className="font-medium text-gray-600">{fileName}</span>
            {counts.verified > 0 && <> · <span className="text-green-600 font-semibold">{counts.verified} AI verified</span></>}
            {counts.overridden > 0 && <> · <span className="text-orange-600 font-semibold">{counts.overridden} overridden</span></>}
            {counts.errors > 0 && <> · <span className="text-red-600 font-semibold">{counts.errors} AI errors</span></>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-8">
          <button onClick={onReset} className="h-10 px-5 border border-[#E5E2DC] text-gray-600 font-semibold rounded-full hover:bg-gray-50 transition-colors text-sm">
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

      <div className="grid grid-cols-5 gap-3">
        {statCards.map(c => (
          <button
            key={c.tab}
            onClick={() => setTab(tab === c.tab ? 'all' : c.tab)}
            className={`bg-white rounded-2xl border-t-4 ${c.accent} border border-[#E5E2DC] p-4 text-left transition-all hover:shadow-sm ${tab === c.tab ? 'ring-2 ring-orange-200' : ''}`}
          >
            <p className={`text-3xl font-bold ${c.text}`}>{c.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{c.label}</p>
            {c.sub && <p className="text-[10px] text-green-600 font-semibold mt-0.5">{c.sub}</p>}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] overflow-hidden">
        <div className="border-b border-[#E5E2DC] px-5 py-3 overflow-x-auto">
          <div className="flex gap-1 bg-[#F5F3F0] rounded-xl p-1 w-fit">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                  tab === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`ml-1 text-xs ${tab === t.key ? 'text-orange-400' : 'text-gray-400'}`}>
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
                <th className="w-8 px-2"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Zuper product</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Match</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">AI</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SRS ID</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SRS Name</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">UOM</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const isExpanded = expanded.has(r.zuper.rowNum);
                const canExpand = r.alternatives.length > 0 || r.matchType !== 'service';
                return (
                  <RowFragment
                    key={r.zuper.rowNum}
                    r={r}
                    i={i}
                    isExpanded={isExpanded}
                    canExpand={canExpand}
                    onToggle={() => toggleExpanded(r.zuper.rowNum)}
                    onPromote={altIdx => promoteAlternative(r.zuper.rowNum, altIdx)}
                    onMarkNoMatch={() => markNoMatch(r.zuper.rowNum)}
                  />
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm">No results in this category.</div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-[#E5E2DC] px-5 py-3 bg-[#F5F3F0] flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Showing {filtered.length.toLocaleString()} of {results.length.toLocaleString()} products
            </p>
            <p className="text-[11px] text-gray-400">
              Click a row to see alternatives and override · Score thresholds: exact ≥{Math.round(MATCHING.SCORE_EXACT*100)}%, fuzzy ≥{Math.round(MATCHING.SCORE_FUZZY*100)}%, partial ≥{Math.round(MATCHING.SCORE_NO_MATCH*100)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  r: MatchResult;
  i: number;
  isExpanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  onPromote: (altIdx: number) => void;
  onMarkNoMatch: () => void;
}

function RowFragment({ r, i, isExpanded, canExpand, onToggle, onPromote, onMarkNoMatch }: RowProps) {
  const dim = r.matchType === 'no_match' && !r.overridden ? 'opacity-60' : '';
  const rowBg = i % 2 === 1 ? 'bg-[#F5F3F0]' : 'bg-white';

  return (
    <>
      <tr className={`border-b border-[#E5E2DC] last:border-0 ${rowBg} ${dim}`}>
        <td className="px-2 py-3 align-top">
          {canExpand && (
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700"
              aria-label="Toggle alternatives"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </td>
        <td className="px-4 py-3 max-w-[260px] align-top">
          <p className="font-medium text-[#1A1A1A] truncate text-xs" title={r.zuper.productName}>{r.zuper.productName}</p>
          <p className="text-[10px] text-gray-400">{r.zuper.productId}</p>
          {r.overridden && (
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
              Overridden
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap align-top">
          {r.zuper.brand || <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-3 whitespace-nowrap align-top">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${MATCH_BADGE[r.matchType]}`}>
            {MATCH_LABEL[r.matchType]}
          </span>
        </td>
        <td className="px-3 py-3 whitespace-nowrap align-top">
          {r.aiError ? (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 cursor-help"
              title={`Verification failed: ${r.aiError}`}
            >
              AI failed
            </span>
          ) : r.aiVerdict ? (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${AI_BADGE[r.aiVerdict].cls} cursor-help`}
              title={r.aiReason}
            >
              {AI_BADGE[r.aiVerdict].label}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs font-mono text-gray-500 whitespace-nowrap align-top">
          {r.srs?.product_id ?? <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-3 max-w-[220px] align-top">
          <p className="text-xs text-gray-600 truncate" title={r.srs?.product_name}>
            {r.srs?.product_name ?? <span className="text-gray-300">—</span>}
          </p>
          {r.srs?.manufacturer && (
            <p className="text-[10px] text-gray-400 truncate">{r.srs.manufacturer}</p>
          )}
        </td>
        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
          {r.srs?.product_uom?.join(', ') ?? <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-3 text-right whitespace-nowrap align-top">
          {r.matchType !== 'no_match' && r.matchType !== 'service' ? (
            <span className="text-xs font-semibold text-gray-500">{Math.round(r.score * 100)}%</span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className={rowBg}>
          <td></td>
          <td colSpan={8} className="px-4 pb-4 pt-1">
            <div className="bg-white rounded-xl border border-[#E5E2DC] p-4 space-y-3">
              {r.aiReason && !r.aiError && (
                <div className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
                  <span className="font-semibold text-gray-600">AI reasoning:</span> {r.aiReason}
                </div>
              )}
              {r.aiError && (
                <div className="text-xs text-red-600 border-l-2 border-red-200 pl-3">
                  <span className="font-semibold">AI verification failed:</span> {r.aiError}
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Alternatives</p>
                {r.alternatives.length === 0 && r.matchType !== 'service' && (
                  <p className="text-xs text-gray-400">No alternative candidates returned by the database.</p>
                )}
                {r.matchType === 'service' && (
                  <p className="text-xs text-blue-500">This product was identified as a service and skipped — SRS catalog contains parts only.</p>
                )}
                <div className="space-y-2">
                  {r.alternatives.map((alt, idx) => (
                    <AltRow key={alt.product_id} alt={alt} idx={idx} onPromote={() => onPromote(idx)} />
                  ))}
                </div>
              </div>

              {r.matchType !== 'service' && r.srs && (
                <div className="flex justify-end pt-1 border-t border-[#E5E2DC]">
                  <button
                    onClick={onMarkNoMatch}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors"
                  >
                    Mark as no match
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AltRow({ alt, idx, onPromote }: { alt: SrsProduct; idx: number; onPromote: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-[#FAF9F7] rounded-lg border border-[#E5E2DC] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[#1A1A1A]">{alt.product_name}</p>
        <p className="text-[10px] text-gray-400">
          ID {alt.product_id} · {alt.manufacturer}
          {alt.product_uom?.length ? ` · UOM ${alt.product_uom.join(', ')}` : ''}
        </p>
      </div>
      <button
        onClick={onPromote}
        className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 px-2.5 py-1 rounded-full hover:bg-orange-50 transition-colors whitespace-nowrap"
      >
        Use #{idx + 2} →
      </button>
    </div>
  );
}
