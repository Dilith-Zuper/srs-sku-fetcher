import { createClient } from '@supabase/supabase-js';
import type { ZuperProduct, SrsProduct, MatchResult, MatchType } from '../types';
import { MATCHING, isServiceType } from './config';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
);

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBrandSuffix(name: string, brand: string): string {
  if (!brand) return name;
  const b = escapeRe(brand.trim());
  let s = name;
  // " | Brand" / " - Brand" / " : Brand" at end
  s = s.replace(new RegExp(`\\s*[|\\-:]\\s*${b}\\s*$`, 'i'), '');
  // "Brand | " / "Brand - " / "Brand: " at start
  s = s.replace(new RegExp(`^\\s*${b}\\s*[|\\-:]\\s*`, 'i'), '');
  // "(Brand)" anywhere
  s = s.replace(new RegExp(`\\s*\\(${b}\\)\\s*`, 'i'), ' ');
  // Fallback: pipe-split last segment matches brand
  const parts = s.split(' | ');
  if (parts.length > 1 && norm(parts[parts.length - 1]) === norm(brand)) {
    s = parts.slice(0, -1).join(' | ');
  }
  return s.trim().replace(/\s+/g, ' ');
}

interface DbRow {
  input_idx: number;
  rank: number;
  product_id: number;
  product_name: string;
  product_category: string;
  manufacturer: string;
  manufacturer_norm: string;
  product_line: string | null;
  product_description: string | null;
  product_uom: string[] | null;
  product_options: string[] | null;
  suggested_price: number | null;
  purchase_price: number | null;
  score: number;
}

function rowToSrsProduct(row: DbRow): SrsProduct {
  return {
    product_id:          row.product_id,
    product_name:        row.product_name,
    product_category:    row.product_category,
    manufacturer:        row.manufacturer,
    manufacturer_norm:   row.manufacturer_norm,
    product_line:        row.product_line,
    product_description: row.product_description,
    product_uom:         row.product_uom,
    product_options:     row.product_options,
    suggested_price:     row.suggested_price,
    purchase_price:      row.purchase_price,
  };
}

function isService(z: ZuperProduct): boolean {
  return isServiceType(z.productType);
}

export function countServices(products: ZuperProduct[]): number {
  return products.filter(isService).length;
}

export async function matchProductsBatch(zuper: ZuperProduct[]): Promise<MatchResult[]> {
  const parts    = zuper.filter(z => !isService(z));
  const services = zuper.filter(z => isService(z));

  if (parts.length === 0) {
    return services.map(z => ({
      zuper: z, srs: null, alternatives: [], matchType: 'service', score: 0,
    }));
  }

  const names        = parts.map(z => stripBrandSuffix(z.productName, z.brand));
  const brands       = parts.map(z => z.brand ?? '');
  const descriptions = parts.map(z => z.productDescription ?? '');

  const { data, error } = await supabase.rpc('match_srs_products_batch', {
    p_names:        names,
    p_brands:       brands,
    p_descriptions: descriptions,
  });

  if (error) throw new Error(`RPC failed: ${error.message}`);

  // Group rows by input_idx, sorted by rank ascending
  const grouped = new Map<number, DbRow[]>();
  for (const r of (data as DbRow[])) {
    const i = r.input_idx - 1;
    const arr = grouped.get(i) ?? [];
    arr.push(r);
    grouped.set(i, arr);
  }
  for (const arr of grouped.values()) arr.sort((a, b) => a.rank - b.rank);

  const partResults: MatchResult[] = parts.map((z, i) => {
    const rows = grouped.get(i) ?? [];
    const top = rows[0];
    if (!top || top.score < MATCHING.SCORE_NO_MATCH) {
      return { zuper: z, srs: null, alternatives: [], matchType: 'no_match', score: 0 };
    }
    const matchType: MatchType =
      top.score >= MATCHING.SCORE_EXACT ? 'exact' :
      top.score >= MATCHING.SCORE_FUZZY ? 'fuzzy' : 'partial';
    return {
      zuper:        z,
      srs:          rowToSrsProduct(top),
      alternatives: rows.slice(1).map(rowToSrsProduct),
      matchType,
      score:        top.score,
    };
  });

  const serviceResults: MatchResult[] = services.map(z => ({
    zuper: z, srs: null, alternatives: [], matchType: 'service', score: 0,
  }));

  // Restore original order
  const resultMap = new Map<number, MatchResult>();
  for (const r of [...partResults, ...serviceResults]) {
    resultMap.set(r.zuper.rowNum, r);
  }
  return zuper.map(z => resultMap.get(z.rowNum)!);
}
