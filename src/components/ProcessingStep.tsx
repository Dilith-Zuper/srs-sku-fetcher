import { useEffect, useRef, useState } from 'react';
import type { ZuperProduct, SrsProduct, MatchResult } from '../types';
import { fetchAllSrsProducts } from '../lib/supabase';
import { matchAll } from '../lib/matcher';
import { verifyMatches } from '../lib/verifier';

interface ProcessingStepProps {
  products: ZuperProduct[];
  onDone: (results: MatchResult[]) => void;
  onError: (msg: string) => void;
}

interface LogLine {
  text: string;
  type: 'info' | 'success' | 'error';
}

type Phase = 'catalog' | 'matching' | 'verifying' | 'done';

export default function ProcessingStep({ products, onDone, onError }: ProcessingStepProps) {
  const [phase, setPhase] = useState<Phase>('catalog');
  const [catalogProgress, setCatalogProgress] = useState({ fetched: 0, total: 0 });
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: products.length });
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<LogLine[]>([{ text: 'Connecting to SRS catalog…', type: 'info' }]);
  const logRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  function addLog(text: string, type: LogLine['type'] = 'info') {
    setLog((prev) => [...prev, { text, type }]);
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const srsProducts: SrsProduct[] = await fetchAllSrsProducts((fetched, total) => {
          setCatalogProgress({ fetched, total });
          if (fetched === total && total > 0) {
            addLog(`Loaded ${total.toLocaleString()} SRS products`, 'success');
          }
        });

        addLog(`Starting fuzzy match for ${products.length} products…`, 'info');
        setPhase('matching');

        let matched = await matchAll(products, srsProducts, (done, total) => {
          setMatchProgress({ done, total });
        });

        const fuzzyCount = matched.filter((r) => r.matchType === 'fuzzy').length;
        const partialCount = matched.filter((r) => r.matchType === 'partial').length;
        const toVerify = fuzzyCount + partialCount;
        addLog(`Fuzzy matching done — ${toVerify} matches queued for AI verification`, 'success');

        setPhase('verifying');
        setVerifyProgress({ done: 0, total: toVerify });
        addLog(`Sending ${toVerify} matches to Claude for verification…`, 'info');

        matched = await verifyMatches(matched, (done, total) => {
          setVerifyProgress({ done, total });
        });

        const exact = matched.filter((r) => r.matchType === 'exact').length;
        const fuzzy = matched.filter((r) => r.matchType === 'fuzzy').length;
        const partial = matched.filter((r) => r.matchType === 'partial').length;
        const none = matched.filter((r) => r.matchType === 'no_match').length;
        const confirmed = matched.filter((r) => r.aiVerdict === 'confirmed').length;
        const rejected = matched.filter((r) => r.aiVerdict === 'rejected').length;

        addLog(
          `AI done — ${confirmed} confirmed, ${rejected} rejected. Final: ${exact} exact, ${fuzzy} fuzzy, ${partial} partial, ${none} unmatched`,
          'success'
        );
        setPhase('done');
        setTimeout(() => onDone(matched), 600);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addLog(`Error: ${msg}`, 'error');
        onError(msg);
      }
    })();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const totalProgress = (() => {
    if (phase === 'catalog') {
      return catalogProgress.total > 0
        ? Math.round((catalogProgress.fetched / catalogProgress.total) * 40)
        : 2;
    }
    if (phase === 'matching') {
      return 40 + Math.round((matchProgress.done / matchProgress.total) * 30);
    }
    if (phase === 'verifying') {
      return 70 + (verifyProgress.total > 0
        ? Math.round((verifyProgress.done / verifyProgress.total) * 30)
        : 0);
    }
    return 100;
  })();

  const CheckIcon = () => (
    <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
      <svg width="10" height="10" viewBox="0 0 12 10" fill="none">
        <path d="M1 4.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
  const SpinIcon = () => (
    <span className="w-5 h-5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin shrink-0" />
  );
  const PendingIcon = () => (
    <span className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
  );

  const phaseStatus = (p: Phase) => {
    const order: Phase[] = ['catalog', 'matching', 'verifying', 'done'];
    const cur = order.indexOf(phase);
    const tgt = order.indexOf(p);
    if (tgt < cur) return 'done';
    if (tgt === cur) return 'active';
    return 'pending';
  };

  const phases: { key: Phase; label: string; detail: string }[] = [
    {
      key: 'catalog',
      label: 'Load SRS catalog',
      detail: catalogProgress.total > 0
        ? `${catalogProgress.fetched.toLocaleString()} / ${catalogProgress.total.toLocaleString()} products`
        : 'Connecting…',
    },
    {
      key: 'matching',
      label: 'Fuzzy matching',
      detail: phase === 'matching'
        ? `${matchProgress.done.toLocaleString()} / ${matchProgress.total.toLocaleString()} products`
        : phaseStatus('matching') === 'done'
        ? `${products.length.toLocaleString()} products matched`
        : 'Waiting…',
    },
    {
      key: 'verifying',
      label: 'AI verification',
      detail: phase === 'verifying'
        ? verifyProgress.total > 0
          ? `${verifyProgress.done.toLocaleString()} / ${verifyProgress.total.toLocaleString()} matches`
          : 'Starting…'
        : phaseStatus('verifying') === 'done'
        ? `${verifyProgress.total.toLocaleString()} matches verified`
        : 'Waiting…',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Step 2 of 3
        </p>
        <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">
          Matching your products
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed mt-2">
          {phase === 'catalog' && 'Fetching the SRS catalog in parallel…'}
          {phase === 'matching' && `Running fuzzy match on ${products.length.toLocaleString()} products…`}
          {phase === 'verifying' && 'Claude is verifying ambiguous matches…'}
          {phase === 'done' && 'All done! Loading results…'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Overall progress
            </span>
            <span className="text-xs font-bold text-orange-600">{totalProgress}%</span>
          </div>
          <div className="h-3 bg-[#E5E2DC] rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500 rounded-full"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {phases.map(({ key, label, detail }) => {
            const status = phaseStatus(key);
            return (
              <div
                key={key}
                className={`rounded-xl border p-4 transition-all ${
                  status === 'active'
                    ? 'border-l-[3px] border-l-orange-400 border-[#E5E2DC]'
                    : status === 'pending'
                    ? 'border-[#E5E2DC] opacity-40'
                    : 'border-[#E5E2DC]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {status === 'active' ? <SpinIcon /> : status === 'done' ? <CheckIcon /> : <PendingIcon />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">{label}</p>
                    <p className="text-xs text-gray-400 truncate">{detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={logRef}
          className="bg-[#1C1917] rounded-2xl p-4 h-40 overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.type === 'success' ? 'text-orange-400' : l.type === 'error' ? 'text-red-400' : 'text-gray-500'
              }
            >
              {l.type === 'success' ? '✓ ' : l.type === 'error' ? '✗ ' : '  '}
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
