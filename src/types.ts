export interface ZuperProduct {
  rowNum: number;
  productNo: string;
  productId: string;
  productName: string;
  productCategory: string;
  productType: string;
  productDescription: string;
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
  suggested_price: number | null;
  purchase_price: number | null;
}

export type MatchType = 'exact' | 'fuzzy' | 'partial' | 'no_match';

export interface MatchResult {
  zuper: ZuperProduct;
  srs: SrsProduct | null;
  matchType: MatchType;
  score: number;
}
