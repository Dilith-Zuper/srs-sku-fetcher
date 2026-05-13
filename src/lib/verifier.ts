import Anthropic from '@anthropic-ai/sdk';
import type { MatchResult, AiVerdict } from '../types';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_KEY as string,
  dangerouslyAllowBrowser: true,
});

function buildPrompt(r: MatchResult): string {
  const { zuper, srs } = r;
  return `You are verifying whether two product catalog entries refer to the same physical product.

ZUPER PRODUCT:
- Name: ${zuper.productName}
- Brand: ${zuper.brand || 'not specified'}
- Category: ${zuper.productCategory}
- Description: ${zuper.productDescription || 'not provided'}

SRS CATALOG ENTRY:
- Name: ${srs!.product_name}
- Manufacturer: ${srs!.manufacturer}
- Category: ${srs!.product_category}
- Product Line: ${srs!.product_line || 'not specified'}

RULES:
- Compare ONLY the information explicitly provided above
- Do NOT assume, infer, or fabricate any product details not given
- Answer YES only if you are highly confident they are the same product
- When in doubt, answer UNCERTAIN — this is always safer than a wrong YES
- Answer NO only if you can clearly identify they are different products

Respond with valid JSON only, no other text:
{"verdict": "YES" | "NO" | "UNCERTAIN", "reason": "one sentence citing only the data above"}`;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
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

async function verifySingle(r: MatchResult): Promise<{ verdict: AiVerdict; reason: string }> {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: buildPrompt(r) }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    const parsed = JSON.parse(text) as { verdict: string; reason: string };
    const v = parsed.verdict.toUpperCase();
    const verdict: AiVerdict = v === 'YES' ? 'confirmed' : v === 'NO' ? 'rejected' : 'uncertain';
    return { verdict, reason: String(parsed.reason ?? '') };
  } catch {
    return { verdict: 'uncertain', reason: 'Verification unavailable' };
  }
}

export async function verifyMatches(
  results: MatchResult[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult[]> {
  const toVerify = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.matchType === 'fuzzy' || r.matchType === 'partial');

  const total = toVerify.length;
  if (total === 0) {
    onProgress(0, 0);
    return results;
  }

  let done = 0;
  const tasks = toVerify.map(({ r, i }) => async () => {
    const { verdict, reason } = await verifySingle(r);
    onProgress(++done, total);

    const updated: MatchResult = { ...r, aiVerdict: verdict, aiReason: reason };
    if (verdict === 'rejected') {
      updated.matchType = 'no_match';
      updated.srs = null;
    } else if (verdict === 'confirmed' && r.matchType === 'partial') {
      updated.matchType = 'fuzzy';
    }
    return { index: i, updated };
  });

  const updates = await runWithConcurrency(tasks, 8);

  const output = [...results];
  for (const { index, updated } of updates) {
    output[index] = updated;
  }
  return output;
}
