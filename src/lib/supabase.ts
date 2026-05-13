import { createClient } from '@supabase/supabase-js';
import type { SrsProduct } from '../types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
);

const SELECT_FIELDS = 'product_id,product_name,product_category,manufacturer,manufacturer_norm,product_line,suggested_price,purchase_price';
const PAGE_SIZE = 1000;

export async function fetchAllSrsProducts(
  onProgress: (fetched: number, total: number) => void
): Promise<SrsProduct[]> {
  const { count } = await supabase
    .from('srs_products')
    .select(SELECT_FIELDS, { count: 'exact', head: true });

  const total = count ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const all: SrsProduct[] = [];

  for (let i = 0; i < pages; i++) {
    const { data, error } = await supabase
      .from('srs_products')
      .select(SELECT_FIELDS)
      .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
    if (data) all.push(...(data as SrsProduct[]));
    onProgress(all.length, total);
  }

  return all;
}
