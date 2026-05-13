import { createClient } from '@supabase/supabase-js';
import type { SrsProduct } from '../types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
);

const SELECT_FIELDS = 'product_id,product_name,product_category,manufacturer,manufacturer_norm,product_line,suggested_price,purchase_price';
const PAGE_SIZE = 500;
const CONCURRENCY = 2;
const MAX_RETRIES = 3;

async function fetchPage(i: number): Promise<SrsProduct[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('srs_products')
      .select(SELECT_FIELDS)
      .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);

    if (!error) return (data ?? []) as SrsProduct[];

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } else {
      throw new Error(`Page ${i} failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
  return [];
}

export async function fetchAllSrsProducts(
  onProgress: (fetched: number, total: number) => void
): Promise<SrsProduct[]> {
  const { count } = await supabase
    .from('srs_products')
    .select(SELECT_FIELDS, { count: 'exact', head: true });

  const total = count ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const results: SrsProduct[][] = new Array(pages);
  let fetched = 0;
  let pageIdx = 0;

  async function worker() {
    while (pageIdx < pages) {
      const i = pageIdx++;
      results[i] = await fetchPage(i);
      fetched += results[i].length;
      onProgress(fetched, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages) }, worker));

  return results.flat();
}
