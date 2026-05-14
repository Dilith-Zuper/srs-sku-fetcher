-- Run this in the Supabase SQL editor whenever this file changes.
-- It is idempotent — safe to re-run.

-- 1. Trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN indexes (description index is now actually used by the WHERE below)
CREATE INDEX IF NOT EXISTS idx_srs_name_trgm
  ON srs_products USING GIN (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_srs_line_trgm
  ON srs_products USING GIN (product_line gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_srs_desc_trgm
  ON srs_products USING GIN (product_description gin_trgm_ops);

-- Drop old version (signature changed: now returns rank and uom/options arrays)
DROP FUNCTION IF EXISTS match_srs_products_batch(TEXT[], TEXT[], TEXT[]);

-- 3. Batch match function: returns up to top-3 candidates per input.
--    Candidate pool widened from 8 to 30 by name OR description match, then
--    re-ranked by the full weighted score (name 60% / description 25% / brand 15%).
CREATE OR REPLACE FUNCTION match_srs_products_batch(
  p_names        TEXT[],
  p_brands       TEXT[],
  p_descriptions TEXT[]
)
RETURNS TABLE(
  input_idx           INT,
  rank                INT,
  product_id          INT,
  product_name        TEXT,
  product_category    TEXT,
  manufacturer        TEXT,
  manufacturer_norm   TEXT,
  product_line        TEXT,
  product_description TEXT,
  product_uom         TEXT[],
  product_options     TEXT[],
  suggested_price     NUMERIC,
  purchase_price      NUMERIC,
  score               FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH scored AS (
    SELECT
      n.idx::INT AS input_idx,
      p.product_id,
      p.product_name,
      p.product_category,
      p.manufacturer,
      p.manufacturer_norm,
      p.product_line,
      p.product_description,
      p.product_uom,
      p.product_options,
      p.suggested_price,
      p.purchase_price,
      LEAST(1.0,
        -- Name: primary signal (60%)
        0.6 * GREATEST(
          similarity(p.product_name, n.name),
          COALESCE(similarity(p.product_line, n.name), 0)
        )
        -- Description: secondary signal (25%), only when both sides have content
        + 0.25 * CASE
            WHEN n.description <> '' AND p.product_description IS NOT NULL
            THEN similarity(p.product_description, n.description)
            ELSE 0
          END
        -- Brand/manufacturer: additive boost (15%)
        + CASE
            WHEN n.brand <> '' AND p.manufacturer IS NOT NULL
              AND similarity(p.manufacturer, n.brand) > 0.3
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
           OR (n.description <> '' AND product_description IS NOT NULL
               AND product_description % n.description)
        ORDER BY
          GREATEST(
            similarity(product_name, n.name),
            COALESCE(similarity(product_line, n.name), 0),
            CASE
              WHEN n.description <> '' AND product_description IS NOT NULL
              THEN similarity(product_description, n.description)
              ELSE 0
            END
          ) DESC
        LIMIT 30
      ) p
  ),
  ranked AS (
    SELECT scored.*,
      ROW_NUMBER() OVER (PARTITION BY input_idx ORDER BY score DESC) AS rnk
    FROM scored
  )
  SELECT
    input_idx, rnk::INT AS rank, product_id, product_name, product_category,
    manufacturer, manufacturer_norm, product_line, product_description,
    product_uom, product_options, suggested_price, purchase_price, score
  FROM ranked
  WHERE rnk <= 3
  ORDER BY input_idx, rnk;
$$;
