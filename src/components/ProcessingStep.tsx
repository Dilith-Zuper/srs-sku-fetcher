import { useEffect, useRef, useState } from 'react';
import type { ZuperProduct, MatchResult } from '../types';
import { matchProductsBatch } from '../lib/supabase';
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

type Phase = 'matching' | 'verifying' | 'done';

export default function ProcessingStep({ products, onDone, onError }: ProcessingStepProps) {
  const [phase, setPhase] = useState<Phase>('matching');
  const [matchDone, setMatchDone] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<LogLine[]>([{ text: `Sending ${products.length} products to database…`, type: 'info' }]);
  const logRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  function addLog(text: string, type: LogLine['type'] = 'info') {
    setLog(prev => [...prev, { text, type }]);
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        // Phase 1: SQL matching — single RPC call
        const t0 = Date.now();
        let matched = await matchProductsBatch(products);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        setMatchDone(true);

        const exact   = matched.filter(r => r.matchType === 'exact').length;
        const fuzzy   = matched.filter(r => r.matchType === 'fuzzy').length;
        const partial = matched.filter(r => r.matchType === 'partial').length;
        const none    = matched.filter(r => r.matchType === 'no_match').length;
        addLog(`SQL match done in ${elapsed}s — ${exact} exact, ${fuzzy} fuzzy, ${partial} partial, ${none} unmatched`, 'success');

        // Phase 2: AI verification
        const toVerify = fuzzy + partial;
        setVerifyProgress({ done: 0, total: toVerify });
        setPhase('verifying');
        addLog(`Sending ${toVerify} matches to Claude for verification…`, 'info');

        matched = await verifyMatches(matched, (done, total) => {
          setVerifyProgress({ done, total });
        });

        const confirmed = matched.filter(r => r.aiVerdict === 'confirmed').length;
        const rejected  = matched.filter(r => r.aiVerdict === 'rejected').length;
        addLog(`AI done — ${confirmed} confirmed, ${rejected} rejected`, 'success');

        setPhase('done');
        setTimeout(() => onDone(matched), 500);
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
    if (!matchDone) return 8;
    if (phase === 'verifying') {
      return 50 + (verifyProgress.total > 0
        ? Math.round((verifyProgress.done / verifyProgress.total) * 50)
        : 2);
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

  const phases = [
    {
      key: 'matching' as Phase,
      label: 'SQL matching',
      detail: matchDone
        ? `${products.length.toLocaleString()} products matched`
        : `Querying database for ${products.length.toLocaleString()} products…`,
    },
    {
      key: 'verifying' as Phase,
      label: 'AI verification',
      detail: phase === 'verifying'
        ? verifyProgress.total > 0
          ? `${verifyProgress.done.toLocaleString()} / ${verifyProgress.total.toLocaleString()} matches`
          : 'Starting…'
        : phase === 'done'
        ? `${verifyProgress.total.toLocaleString()} matches verified`
        : 'Waiting…',
    },
  ];

  const phaseStatus = (key: Phase): 'done' | 'active' | 'pending' => {
    if (key === 'matching') return matchDone ? 'done' : 'active';
    if (key === 'verifying') return phase === 'verifying' ? 'active' : phase === 'done' ? 'done' : 'pending';
    return 'pending';
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Step 2 of 3</p>
        <h1 className="text-[36px] font-extrabold text-[#1A1A1A] leading-tight">Matching your products</h1>
        <p className="text-sm text-gray-500 leading-relaxed mt-2">
          {!matchDone && 'PostgreSQL is comparing names, descriptions, and brands against 19k SRS products…'}
          {matchDone && phase === 'verifying' && 'Claude is verifying ambiguous matches…'}
          {phase === 'done' && 'All done! Loading results…'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E2DC] p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall progress</span>
            <span className="text-xs font-bold text-orange-600">{totalProgress}%</span>
          </div>
          <div className="h-3 bg-[#E5E2DC] rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500 rounded-full"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
                    <p className="text-sm font-semibold text-[#1A1A1A]">{label}</p>
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
              className={l.type === 'success' ? 'text-orange-400' : l.type === 'error' ? 'text-red-400' : 'text-gray-500'}
            >
              {l.type === 'success' ? '✓ ' : l.type === 'error' ? '✗ ' : '  '}{l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
