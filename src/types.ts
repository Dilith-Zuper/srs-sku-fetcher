export interface ZuperProduct {
  rowNum: number;
  productNo: string;
  productId: string;
  productName: string;
  productCategory: string;
  productType: string;
  productDescription: string; // from Specification column (col 9 / row[8])
  supplier: string;           // from Description column (col 7 / row[6]) — usually a supplier name in Zuper exports
  brand: string;
  price: string;
}

export interface SrsProduct {
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
}

export type MatchType = 'exact' | 'fuzzy' | 'partial' | 'no_match' | 'service';
export type AiVerdict = 'confirmed' | 'rejected' | 'uncertain';

export interface MatchResult {
  zuper: ZuperProduct;
  srs: SrsProduct | null;
  alternatives: SrsProduct[]; // up to 2 runner-up candidates from SQL
  matchType: MatchType;
  score: number;
  aiVerdict?: AiVerdict;
  aiReason?: string;
  aiError?: string;           // present when Claude verification failed for this row
  overridden?: boolean;       // true if user manually picked a different SRS or marked no_match
}
