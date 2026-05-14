import type { ZuperProduct } from '../types';

export async function parseZuperExcel(file: File): Promise<ZuperProduct[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  // Column map (0-indexed) based on Zuper Product Report export:
  //  1  Product No
  //  2  Product ID
  //  3  Product Name
  //  4  Product Category
  //  5  Product Type
  //  6  Description    <- often a supplier name in Zuper exports
  //  7  Brand
  //  8  Specification  <- the real product description / spec
  // 14  Price
  const products: ZuperProduct[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const name = row[3];
    if (!name) continue;
    products.push({
      rowNum: i,
      productNo:           String(row[1] ?? ''),
      productId:           String(row[2] ?? ''),
      productName:         String(name),
      productCategory:     String(row[4] ?? ''),
      productType:         String(row[5] ?? ''),
      supplier:            String(row[6] ?? ''),
      brand:               String(row[7] ?? ''),
      productDescription:  String(row[8] ?? ''),
      price:               String(row[14] ?? ''),
    });
  }
  return products;
}

// Group products by normalized name+brand+price to detect likely duplicates.
// Returns the count of products that appear more than once.
export function countLikelyDuplicates(products: ZuperProduct[]): number {
  const key = (p: ZuperProduct) =>
    `${p.productName.toLowerCase().trim()}|${p.brand.toLowerCase().trim()}|${p.price}`;
  const counts = new Map<string, number>();
  for (const p of products) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  let dupes = 0;
  for (const c of counts.values()) if (c > 1) dupes += c;
  return dupes;
}
