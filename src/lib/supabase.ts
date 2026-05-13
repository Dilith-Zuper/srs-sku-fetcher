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
  let fetched = 0;

  const pageResults = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from('srs_products')
        .select(SELECT_FIELDS)
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
        .then(({ data, error }) => {
          if (error) throw new Error(`Page ${i} failed: ${error.message}`);
          fetched += data?.length ?? 0;
          onProgress(fetched, total);
          return (data ?? []) as SrsProduct[];
        })
    )
  );

  return pageResults.flat();
}
