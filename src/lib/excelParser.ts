import * as XLSX from 'xlsx';
import type { ZuperProduct } from '../types';

export function parseZuperExcel(file: File): Promise<ZuperProduct[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

        const products: ZuperProduct[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          const name = row[3];
          if (!name) continue;
          products.push({
            rowNum: i,
            productNo: String(row[1] ?? ''),
            productId: String(row[2] ?? ''),
            productName: String(name),
            productCategory: String(row[4] ?? ''),
            productType: String(row[5] ?? ''),
            productDescription: String(row[6] ?? ''),
            brand: String(row[7] ?? ''),
            price: String(row[14] ?? ''),
          });
        }
        resolve(products);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
