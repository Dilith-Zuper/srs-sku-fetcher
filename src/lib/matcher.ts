import Fuse from 'fuse.js';
import type { ZuperProduct, SrsProduct, MatchResult, MatchType } from '../types';

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function stripBrandSuffix(name: string, brand: string): string {
  if (!brand) return name;
  const suffix = ` | ${brand}`;
  if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim();
  const parts = name.split(' | ');
  if (parts.length > 1 && norm(parts[parts.length - 1]) === norm(brand)) {
    return parts.slice(0, -1).join(' | ').trim();
  }
  return name;
}

function manufacturerMatches(srsManuf: string, zuperBrand: string): boolean {
  if (!zuperBrand) return false;
  const m = norm(srsManuf);
  const b = norm(zuperBrand);
  return m === b || m.startsWith(b) || b.startsWith(m.split(' ')[0]);
}

export async function matchAll(
  zuper: ZuperProduct[],
  srs: SrsProduct[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult[]> {
  const fuse = new Fuse(srs, {
    keys: [
      { name: 'product_name', weight: 0.65 },
      { name: 'product_line', weight: 0.25 },
      { name: 'manufacturer', weight: 0.1 },
    ],
    includeScore: true,
    threshold: 0.6,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  const exactByName = new Map<string, SrsProduct>();
  for (const p of srs) {
    exactByName.set(norm(p.product_name), p);
    if (p.product_line) exactByName.set(norm(p.product_line), p);
  }

  const results: MatchResult[] = [];
  const BATCH = 20;

  for (let i = 0; i < zuper.length; i += BATCH) {
    const batch = zuper.slice(i, i + BATCH);
    for (const z of batch) {
      results.push(matchOne(z, fuse, exactByName));
    }
    onProgress(Math.min(i + BATCH, zuper.length), zuper.length);
    await new Promise((r) => setTimeout(r, 0));
  }

  return results;
}

function matchOne(
  z: ZuperProduct,
  fuse: Fuse<SrsProduct>,
  exactByName: Map<string, SrsProduct>
): MatchResult {
  const zNameNorm = norm(z.productName);
  const zClean = norm(stripBrandSuffix(z.productName, z.brand));
  const zBrand = z.brand;

  const exact = exactByName.get(zNameNorm) ?? exactByName.get(zClean);
  if (exact) {
    return { zuper: z, srs: exact, matchType: 'exact', score: 1.0 };
  }

  const searchTerm = zClean || z.productName;
  const fuseResults = fuse.search(searchTerm);

  if (fuseResults.length === 0) {
    return { zuper: z, srs: null, matchType: 'no_match', score: 0 };
  }

  let bestItem = fuseResults[0].item;
  let bestScore = 1 - (fuseResults[0].score ?? 1);

  for (const r of fuseResults.slice(0, 8)) {
    const baseConf = 1 - (r.score ?? 1);
    const boost = zBrand && manufacturerMatches(r.item.manufacturer, zBrand) ? 0.12 : 0;
    const total = Math.min(baseConf + boost, 1.0);
    if (total > bestScore) {
      bestScore = total;
      bestItem = r.item;
    }
  }

  let matchType: MatchType;
  if (bestScore >= 0.68) matchType = 'fuzzy';
  else if (bestScore >= 0.48) matchType = 'partial';
  else matchType = 'no_match';

  return {
    zuper: z,
    srs: matchType !== 'no_match' ? bestItem : null,
    matchType,
    score: bestScore,
  };
}
