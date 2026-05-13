-- Run this once in the Supabase SQL editor before using the SRS SKU Fetcher app.

-- 1. Enable trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN indexes for fast trigram search (required for performance)
CREATE INDEX IF NOT EXISTS idx_srs_name_trgm
  ON srs_products USING GIN (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_srs_line_trgm
  ON srs_products USING GIN (product_line gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_srs_desc_trgm
  ON srs_products USING GIN (product_description gin_trgm_ops);

-- 3. Batch match function
--    Takes arrays of Zuper product names, brands, and descriptions.
--    Returns the single best-scoring SRS match per input, using:
--      - Name similarity vs product_name / product_line  (weight 0.60)
--      - Description similarity vs product_description   (weight 0.25, only when both sides have it)
--      - Brand/manufacturer similarity                   (weight 0.15, additive boost)
CREATE OR REPLACE FUNCTION match_srs_products_batch(
  p_names        TEXT[],
  p_brands       TEXT[],
  p_descriptions TEXT[]
)
RETURNS TABLE(
  input_idx         INT,
  product_id        INT,
  product_name      TEXT,
  product_category  TEXT,
  manufacturer      TEXT,
  manufacturer_norm TEXT,
  product_line      TEXT,
  product_description TEXT,
  suggested_price   NUMERIC,
  purchase_price    NUMERIC,
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (n.idx)
    n.idx::INT,
    p.product_id,
    p.product_name,
    p.product_category,
    p.manufacturer,
    p.manufacturer_norm,
    p.product_line,
    p.product_description,
    p.suggested_price,
    p.purchase_price,
    LEAST(1.0,
      -- Name: primary signal (60%)
      0.6 * GREATEST(
        similarity(p.product_name, n.name),
        COALESCE(similarity(p.product_line, n.name), 0)
      )
      -- Description: secondary signal (25%) — only when both sides have content
      + 0.25 * CASE
          WHEN n.description <> '' AND p.product_description IS NOT NULL
          THEN similarity(p.product_description, n.description)
          ELSE 0
        END
      -- Brand/manufacturer: boost (15%)
      + CASE
          WHEN n.brand <> '' AND similarity(p.manufacturer, n.brand) > 0.3
          THEN 0.15 ELSE 0
        END
    ) AS score
  FROM
    unnest(p_names, p_brands, p_descriptions)
      WITH ORDINALITY AS n(name, brand, description, idx)
    CROSS JOIN LATERAL (
      SELECT *
      FROM srs_products
      WHERE product_name % n.name
         OR (product_line IS NOT NULL AND product_line % n.name)
      ORDER BY
        GREATEST(
          similarity(product_name, n.name),
          COALESCE(similarity(product_line, n.name), 0)
        ) DESC
      LIMIT 8
    ) p
  ORDER BY n.idx, score DESC;
$$;
