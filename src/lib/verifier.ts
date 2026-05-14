import type { MatchResult, AiVerdict, SrsProduct } from '../types';
import { MATCHING } from './config';

function fmtCandidate(srs: SrsProduct, n: number): string {
  const uom = srs.product_uom?.length ? srs.product_uom.join(', ') : 'not specified';
  const options = srs.product_options?.filter(o => o && o !== 'N/A').join(', ') || 'not specified';
  return `  [Candidate ${n}] id=${srs.product_id}
    Name: ${srs.product_name}
    Description: ${srs.product_description || 'not provided'}
    Manufacturer: ${srs.manufacturer}
    Product Line: ${srs.product_line || 'not specified'}
    UOM: ${uom}
    Options: ${options}`;
}

function buildBatchPrompt(matches: MatchResult[]): string {
  const items = matches.map((r, i) => {
    const candidates = [r.srs!, ...r.alternatives].slice(0, 3);
    const candidateBlock = candidates.map((c, j) => fmtCandidate(c, j + 1)).join('\n');
    return `=== Item ${i + 1} ===
ZUPER:
  Name: ${r.zuper.productName}
  Description: ${r.zuper.productDescription || 'not provided'}
  Brand: ${r.zuper.brand || 'not specified'}

SRS CANDIDATES (pick which one, if any, is the same product):
${candidateBlock}`;
  }).join('\n\n');

  return `You are verifying product catalog matches. For each item below you are given a Zuper product and up to 3 SRS candidates. Your job: decide which candidate (if any) is the same physical product.

Focus on product name and description as the primary signals, then brand/manufacturer and product line. Ignore category — the two systems use different taxonomies. Use UOM and Options to disambiguate same-name products of different size, color, or pack count.

For each item, reply with one of:
- best: 1 | 2 | 3, verdict: YES — that candidate is the same product
- best: null, verdict: NO — none of the candidates match
- best: null, verdict: UNCERTAIN — not enough evidence to decide confidently

RULES:
- Compare ONLY the information explicitly provided
- Do NOT assume, infer, or fabricate any product details
- If the SRS UOM or Options suggest a different size/color/pack count than the Zuper name implies, prefer NO or UNCERTAIN over a wrong YES
- UNCERTAIN is always safer than a wrong YES or NO

${items}

Respond with a JSON array only, no other text, no markdown fences:
[{"id": 1, "best": 1 | 2 | 3 | null, "verdict": "YES" | "NO" | "UNCERTAIN", "reason": "one sentence citing only the data above"}, ...]`;
}

interface BatchVerdictRow {
  id: number;
  best: number | null;
  verdict: string;
  reason: string;
}

function repairJson(text: string): string {
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) s = s.substring(start, end + 1);
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
}

type ItemVerdict =
  | { kind: 'ok'; verdict: AiVerdict; reason: string; bestIndex: number | null }
  | { kind: 'error'; error: string };

async function callClaudeOnce(prompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: import.meta.env.VITE_ANTHROPIC_KEY as string,
    dangerouslyAllowBrowser: true,
  });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: MATCHING.AI_BATCH_SIZE * MATCHING.AI_MAX_TOKENS_PER_ITEM,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

async function verifyBatch(matches: MatchResult[]): Promise<ItemVerdict[]> {
  const prompt = buildBatchPrompt(matches);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callClaudeOnce(prompt);
      let parsed: BatchVerdictRow[];
      try {
        parsed = JSON.parse(raw) as BatchVerdictRow[];
      } catch {
        parsed = JSON.parse(repairJson(raw)) as BatchVerdictRow[];
      }
      return matches.map((_, i): ItemVerdict => {
        const row = parsed.find(r => r.id === i + 1);
        if (!row) return { kind: 'error', error: 'No response from Claude for this item' };
        const v = String(row.verdict ?? '').toUpperCase();
        const verdict: AiVerdict = v === 'YES' ? 'confirmed' : v === 'NO' ? 'rejected' : 'uncertain';
        const bestIndex =
          row.best === 1 || row.best === 2 || row.best === 3 ? row.best - 1 : null;
        return { kind: 'ok', verdict, reason: String(row.reason ?? ''), bestIndex };
      });
    } catch (err) {
      if (attempt === 1) {
        const msg = err instanceof Error ? err.message : String(err);
        return matches.map(() => ({ kind: 'error', error: msg.slice(0, 120) }));
      }
      // retry once on first failure
    }
  }
  return matches.map(() => ({ kind: 'error', error: 'Verification failed' }));
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function applyVerdict(r: MatchResult, v: ItemVerdict): MatchResult {
  if (v.kind === 'error') {
    return { ...r, aiError: v.error };
  }

  let srs = r.srs;
  let alternatives = r.alternatives;

  // Claude can promote an alternative to top if the SQL #1 wasn't the best pick.
  const bi = v.bestIndex;
  if (bi !== null && bi > 0 && r.alternatives.length >= bi) {
    const promoted = r.alternatives[bi - 1];
    const others = r.alternatives.filter((_, i) => i !== bi - 1);
    srs = promoted;
    alternatives = r.srs ? [r.srs, ...others] : others;
  }

  const updated: MatchResult = {
    ...r,
    srs,
    alternatives,
    aiVerdict: v.verdict,
    aiReason:  v.reason,
  };

  if (v.verdict === 'rejected') {
    updated.matchType = 'no_match';
    updated.srs = null;
  } else if (v.verdict === 'confirmed' && r.matchType === 'partial') {
    updated.matchType = 'fuzzy';
  }
  return updated;
}

export async function verifyMatches(
  results: MatchResult[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult[]> {
  const toVerify = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.matchType === 'fuzzy' || r.matchType === 'partial') && r.srs);

  const total = toVerify.length;
  if (total === 0) {
    onProgress(0, 0);
    return results;
  }

  const batches: { items: typeof toVerify }[] = [];
  for (let s = 0; s < toVerify.length; s += MATCHING.AI_BATCH_SIZE) {
    batches.push({ items: toVerify.slice(s, s + MATCHING.AI_BATCH_SIZE) });
  }

  const output = [...results];
  let done = 0;

  const tasks = batches.map(b => async () => {
    const verdicts = await verifyBatch(b.items.map(x => x.r));
    for (let j = 0; j < b.items.length; j++) {
      const { r, i } = b.items[j];
      output[i] = applyVerdict(r, verdicts[j]);
    }
    done += b.items.length;
    onProgress(done, total);
  });

  await runWithConcurrency(tasks, MATCHING.AI_BATCH_CONCURRENCY);
  return output;
}
