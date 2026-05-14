import Anthropic from '@anthropic-ai/sdk';
import type { MatchResult, AiVerdict } from '../types';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_KEY as string,
  dangerouslyAllowBrowser: true,
});

const BATCH_SIZE = 20;

function buildBatchPrompt(matches: MatchResult[]): string {
  const items = matches.map((r, i) => {
    const { zuper, srs } = r;
    return `[${i + 1}]
Zuper — Name: ${zuper.productName} | Brand: ${zuper.brand || 'not specified'} | Description: ${zuper.productDescription || 'not provided'}
SRS   — Name: ${srs!.product_name} | Manufacturer: ${srs!.manufacturer} | Description: ${srs!.product_description || 'not provided'} | Product Line: ${srs!.product_line || 'not specified'}`;
  }).join('\n\n');

  return `You are verifying whether product catalog entries refer to the same physical product.

Focus on product name and description as primary signals, then brand/manufacturer and product line. Ignore category — the two systems use different taxonomies.

For each numbered pair below, decide:
- YES — highly confident they are the same product (name and/or description clearly match)
- NO — clearly different products
- UNCERTAIN — not enough evidence; when in doubt always prefer this over a wrong YES

RULES:
- Compare ONLY the information explicitly provided
- Do NOT assume, infer, or fabricate any product details
- UNCERTAIN is always safer than a wrong YES or NO

${items}

Respond with a JSON array only, no other text:
[{"id": 1, "verdict": "YES" | "NO" | "UNCERTAIN", "reason": "one sentence citing only the data above"}, ...]`;
}

interface BatchVerdictRow { id: number; verdict: string; reason: string; }

async function verifyBatch(
  matches: MatchResult[]
): Promise<{ verdict: AiVerdict; reason: string }[]> {
  const fallback = matches.map(() => ({ verdict: 'uncertain' as AiVerdict, reason: 'Verification unavailable' }));
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: BATCH_SIZE * 60,
      messages: [{ role: 'user', content: buildBatchPrompt(matches) }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    const rows = JSON.parse(text) as BatchVerdictRow[];

    return matches.map((_, i) => {
      const row = rows.find(r => r.id === i + 1);
      if (!row) return { verdict: 'uncertain' as AiVerdict, reason: 'No response for this item' };
      const v = row.verdict.toUpperCase();
      const verdict: AiVerdict = v === 'YES' ? 'confirmed' : v === 'NO' ? 'rejected' : 'uncertain';
      return { verdict, reason: String(row.reason ?? '') };
    });
  } catch {
    return fallback;
  }
}

export async function verifyMatches(
  results: MatchResult[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult[]> {
  const toVerify = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.matchType === 'fuzzy' || r.matchType === 'partial');  // services and no_match skipped

  const total = toVerify.length;
  if (total === 0) {
    onProgress(0, 0);
    return results;
  }

  const output = [...results];
  let done = 0;

  for (let start = 0; start < toVerify.length; start += BATCH_SIZE) {
    const batch = toVerify.slice(start, start + BATCH_SIZE);
    const verdicts = await verifyBatch(batch.map(({ r }) => r));

    for (let j = 0; j < batch.length; j++) {
      const { r, i } = batch[j];
      const { verdict, reason } = verdicts[j];
      const updated: MatchResult = { ...r, aiVerdict: verdict, aiReason: reason };

      if (verdict === 'rejected') {
        updated.matchType = 'no_match';
        updated.srs = null;
      } else if (verdict === 'confirmed' && r.matchType === 'partial') {
        updated.matchType = 'fuzzy';
      }
      output[i] = updated;
    }

    done += batch.length;
    onProgress(done, total);
  }

  return output;
}
