import { createClient } from '@supabase/supabase-js';
import type { ZuperProduct, SrsProduct, MatchResult, MatchType } from '../types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
);

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

interface DbRow {
  input_idx: number;
  product_id: number;
  product_name: string;
  product_category: string;
  manufacturer: string;
  manufacturer_norm: string;
  product_line: string | null;
  product_description: string | null;
  suggested_price: number | null;
  purchase_price: number | null;
  score: number;
}

function rowToSrsProduct(row: DbRow): SrsProduct {
  return {
    product_id: row.product_id,
    product_name: row.product_name,
    product_category: row.product_category,
    manufacturer: row.manufacturer,
    manufacturer_norm: row.manufacturer_norm,
    product_line: row.product_line,
    product_description: row.product_description,
    suggested_price: row.suggested_price,
    purchase_price: row.purchase_price,
  };
}

export async function matchProductsBatch(zuper: ZuperProduct[]): Promise<MatchResult[]> {
  const names        = zuper.map(z => stripBrandSuffix(z.productName, z.brand));
  const brands       = zuper.map(z => z.brand ?? '');
  const descriptions = zuper.map(z => z.productDescription ?? '');

  const { data, error } = await supabase.rpc('match_srs_products_batch', {
    p_names:        names,
    p_brands:       brands,
    p_descriptions: descriptions,
  });

  if (error) throw new Error(`RPC failed: ${error.message}`);

  const byIdx = new Map<number, DbRow>(
    (data as DbRow[]).map(r => [r.input_idx - 1, r])  // WITH ORDINALITY is 1-based
  );

  return zuper.map((z, i) => {
    const row = byIdx.get(i);
    if (!row || row.score < 0.30) {
      return { zuper: z, srs: null, matchType: 'no_match', score: 0 };
    }
    const matchType: MatchType =
      row.score >= 0.90 ? 'exact' :
      row.score >= 0.52 ? 'fuzzy' : 'partial';
    return { zuper: z, srs: rowToSrsProduct(row), matchType, score: row.score };
  });
}
