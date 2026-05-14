# SRS SKU Fetcher — Project Context

## What this is

A web tool that takes a Zuper account's product export (Excel) and maps each product to its corresponding SRS Roofing catalog SKU. The output is an enriched Excel with SRS product IDs, names, manufacturers, UOMs, match confidence scores, and Claude's AI reasoning per row.

**Live:** https://srs-sku-fetcher.vercel.app  
**GitHub:** https://github.com/Dilith-Zuper/srs-sku-fetcher  
**Supabase project:** kbdczzldmyayliwajwma (holds the SRS catalog)

---

## Why it exists

When onboarding a roofing account onto Zuper, the CSM team needs to map the customer's existing product list to SRS Distribution's catalog so that orders can be placed correctly. This used to be done manually — scanning a 19,807-row SRS catalog against the account's product list row by row. This tool automates that matching, adds AI verification for the ambiguous cases, and produces an Excel the team can review and hand off.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v3 (DESIGN.md tokens) |
| Database | Supabase (PostgreSQL + PostgREST) |
| Fuzzy matching | PostgreSQL `pg_trgm` extension (server-side) |
| AI verification | Anthropic Claude Haiku 4.5 |
| Excel I/O | SheetJS (`xlsx`) — dynamically imported |
| Deployment | Vercel (SPA with rewrite rule) |

---

## Project structure

```
src/
  App.tsx                  — step state machine (upload → processing → results)
  types.ts                 — ZuperProduct, SrsProduct, MatchResult, AiVerdict
  lib/
    config.ts              — all tunable constants (thresholds, batch sizes, weights)
    supabase.ts            — Supabase client + matchProductsBatch() RPC wrapper
    verifier.ts            — Claude AI batch verification
    excelParser.ts         — parses Zuper .xlsx upload
    excelExporter.ts       — writes output .xlsx with all result columns
    guide-content.ts       — help drawer content per step (title, steps, FAQs)
  components/
    Header.tsx             — shared header with step badge + "Need help?" link
    GuidePanel.tsx         — right-side help drawer (slide-in, FAQ accordion)
    UploadStep.tsx         — drag/drop file upload with parts/services/duplicates preview
    ProcessingStep.tsx     — two-phase progress UI (SQL + AI)
    ResultsStep.tsx        — results table with override UI, tabs, download

supabase/
  setup.sql                — one-time DB setup: pg_trgm, GIN indexes, match function

public/
  zuper-logo.svg
```

---

## Data sources

### Zuper product export (input)
Excel file exported from Zuper → Product Report. Key columns read (0-indexed):
| Index | Column | Used for |
|-------|--------|----------|
| 1 | Product No | Pass-through to output |
| 2 | Product ID | Zuper's own SKU, pass-through |
| 3 | Product Name | **Primary match signal** |
| 4 | Product Category | Pass-through |
| 5 | Product Type | Service detection |
| 6 | Description | Saved as `supplier` — usually a supplier name like "ABC Supply", NOT a product description |
| 7 | Brand | Match signal + brand suffix stripping |
| 8 | Specification | **Product description** — the real spec text (e.g. "Non-brand-specific asphalt shingle for repair…") |
| 14 | Price | Pass-through |

> **Important:** Zuper's "Description" column (col 7 / index 6) is typically the supplier name, not a product description. The actual product spec is in "Specification" (col 9 / index 8). The parser reads `row[8]` as `productDescription` and `row[6]` as `supplier`.

### SRS catalog (Supabase)
Table: `srs_products` — 19,807 records.  
Matching-relevant fields: `product_name`, `product_line`, `product_description`, `manufacturer`, `product_uom` (jsonb), `product_options` (jsonb), `suggested_price`, `purchase_price`.

---

## Matching pipeline

### Step 1 — Service filtering
Before any matching, products are split by `productType`:
- Whitelist `['SERVICE', 'SERVICES', 'LABOR']` → marked `matchType: 'service'`, skipped from SQL, kept in output
- Everything else → sent to Supabase

### Step 2 — SQL trigram matching (server-side)
Client calls `supabase.rpc('match_srs_products_batch', { p_names, p_brands, p_descriptions })` in **batches of 50**, 2 concurrent (to stay under Supabase's ~8s statement timeout).

The PostgreSQL function (`supabase/setup.sql`):
1. For each input, runs a `CROSS JOIN LATERAL` that uses three GIN indexes to pull up to **30 candidate SRS products** matching on name, product line, OR description
2. Scores each candidate with a weighted formula:
   - **Name similarity** (vs `product_name` or `product_line`): **60% weight**
   - **Description similarity** (vs `product_description`, only when both sides have content): **25% weight**
   - **Brand/manufacturer match boost** (when `similarity(manufacturer, brand) > 0.3`): **+15%**
3. Uses `ROW_NUMBER() OVER (PARTITION BY input_idx ORDER BY score DESC)` to return the **top 3 candidates** per input
4. Client maps top candidate to `srs` field, runners-up to `alternatives[]`

**Score thresholds** (see `src/lib/config.ts`):
| Score | MatchType |
|-------|-----------|
| ≥ 0.90 | `exact` |
| ≥ 0.52 | `fuzzy` |
| ≥ 0.30 | `partial` |
| < 0.30 / no result | `no_match` |

**Brand suffix stripping** is applied to the product name before sending to SQL. It handles patterns: ` | Brand`, `Brand | `, `Brand: `, `(Brand)`, hyphen-separated variants.

### Step 3 — Claude AI verification
Only `fuzzy` and `partial` rows are verified. Batches of 20 matches, 3 batches concurrent.

Each prompt includes:
- All 3 SQL candidates per Zuper product
- Zuper: name, specification (description), brand
- SRS (per candidate): name, description, manufacturer, product line, UOM, options
- Instruction to focus on name/description first, then brand/UOM/options

Claude returns JSON: `[{ id, best: 1|2|3|null, verdict: YES|NO|UNCERTAIN, reason }]`

Post-verification logic:
| AI says | Result |
|---------|--------|
| YES, best=1 | `aiVerdict: confirmed`, no match type change |
| YES, best=2 or 3 | Promote that candidate to `srs`, demote old top to `alternatives[0]` |
| NO | `matchType: no_match`, `srs: null` |
| UNCERTAIN | No change, `aiVerdict: uncertain` |
| Error | `aiError: string`, no match type change — SQL match stands, flagged for review |

Partial matches confirmed by Claude get upgraded to `fuzzy`.

**Anti-hallucination design:**
- Prompt explicitly says "Compare ONLY what is provided, do NOT assume or infer"
- UNCERTAIN is the preferred safe answer when in doubt
- UOM/options mismatch instruction: prefer NO/UNCERTAIN when size/color/pack count differs
- One retry + JSON repair (strip markdown fences, remove trailing commas) before marking as failed

---

## Output Excel columns

`#`, `Product No`, `Product ID (Zuper)`, `Product Name`, `Product Category`, `Brand`, `Specification`, `Supplier (Zuper)`, `Price (Zuper)`, `SRS Product ID`, `SRS Product Name`, `SRS Manufacturer`, `SRS Category`, `SRS UOM`, `SRS Suggested Price`, `Alt 1 SRS ID`, `Alt 1 SRS Name`, `Alt 2 SRS ID`, `Alt 2 SRS Name`, `Match Type`, `Match Score %`, `AI Verdict`, `AI Reason`, `AI Status`, `Manually Overridden`

---

## UI flow

```
Step 1 — Upload
  → drag/drop .xlsx
  → preview: parts to match / services skipped / likely duplicates count
  → "Run matching →"

Step 2 — Processing  [auto, no user interaction]
  → SQL matching: 0→50% of progress bar (50 products per RPC batch, 2 concurrent)
  → AI verification: 50→100% (20 items per Claude call, 3 concurrent)
  → terminal log shows progress and summary

Step 3 — Results
  → 5 stat cards (Exact / Fuzzy / Partial / No Match / Services)
  → 8 tabs for filtering (All / Exact / Fuzzy / Partial / No Match / Services / Verified / AI Errors)
  → Each row expandable: shows Claude reasoning + up to 2 alternative SRS candidates
  → Override actions: "Use #2 →", "Use #3 →", "Mark as no match"
  → "Download Excel →" exports with all columns including overrides
```

---

## Configuration

All tunable constants live in `src/lib/config.ts`:

```typescript
SCORE_EXACT:            0.90   // pg_trgm score at or above = Exact match
SCORE_FUZZY:            0.52   // at or above = Fuzzy
SCORE_NO_MATCH:         0.30   // below = No Match (also the pg_trgm % threshold)
SQL_TOP_K:              3      // candidates returned per input from SQL
RPC_BATCH_SIZE:         50     // products per Supabase RPC call
RPC_BATCH_CONCURRENCY:  2      // concurrent RPC calls
AI_BATCH_SIZE:          20     // matches per Claude call
AI_BATCH_CONCURRENCY:   3      // concurrent Claude calls
AI_MAX_TOKENS_PER_ITEM: 90     // max_tokens = batch_size × this
SERVICE_TYPES:          ['SERVICE', 'SERVICES', 'LABOR']
```

SQL scoring weights live in `supabase/setup.sql` (name 0.60 / description 0.25 / brand boost 0.15). Changing these requires re-running setup.sql in the Supabase SQL editor.

---

## Environment variables

Set in `.env.local` locally and in Vercel project settings for production:

```
VITE_SUPABASE_URL=https://kbdczzldmyayliwajwma.supabase.co
VITE_SUPABASE_KEY=<service role key>
VITE_ANTHROPIC_KEY=<Anthropic API key>
```

The Anthropic key is from the shared Onboarding Compass project key. The Supabase service role key is in `product importer/.env`.

---

## Supabase setup (one-time)

Run `supabase/setup.sql` in the Supabase Dashboard SQL Editor:
- Enables `pg_trgm` extension
- Creates 3 GIN indexes on `product_name`, `product_line`, `product_description`
- Creates/replaces the `match_srs_products_batch` function

**Must re-run** when `setup.sql` changes (e.g. after adding new return columns). The file includes `DROP FUNCTION IF EXISTS` so it is safe to re-run at any time.

---

## Deployment

Hosted on Vercel (account: `dilith-zupers-projects`). The `vercel.json` has a single SPA rewrite rule:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Deploy: `vercel --prod` from the project root (Vercel CLI is already linked).  
Auto-deploys are **not** configured — all deploys are manual via the CLI.

GitHub repo `Dilith-Zuper/srs-sku-fetcher` is connected to the Vercel project but auto-deploy on push is not enabled.

---

## Key design decisions

**Why server-side SQL matching instead of client-side Fuse.js?**  
Originally used Fuse.js with a full 19,807-row download. This was slow, fragile (page timeout on last batch), and kept a large dataset in browser memory. PostgreSQL `pg_trgm` with GIN indexes is faster, runs where the data lives, and uses established text-search algorithms.

**Why Claude for verification rather than more SQL tuning?**  
Trigram similarity is purely character-based — it can't tell "Roof Cement 10oz" from "Roof Cement 32oz" (same name, different SKU). Claude reads UOM, options, and descriptions semantically. Used only on the medium-confidence tier (fuzzy + partial) to keep cost near zero (~$0.01 per run).

**Why batched RPC calls (50) instead of one?**  
A single call with all 348 products + LIMIT 30 candidates hit Supabase's ~8s statement timeout. Batching to 50 products per call keeps each query well under the limit while still being faster than sequential fetching via 2-concurrent workers.

**Why top-3 candidates from SQL?**  
The weighted score (name + description + brand) is computed after the LATERAL subquery filters by name alone. The true best match by combined score might rank 11th by name alone and be excluded with LIMIT 8. Widening to LIMIT 30 + returning top 3 by final score gives Claude the option to correct a wrong #1 SQL pick.

**Why is the Specification column used for description, not Description?**  
Zuper's Product Report export populates the Description column (col 7) with the supplier name (e.g. "ABC Supply"). The real product text lives in the Specification column (col 9). Using the wrong column degraded both SQL similarity scores and Claude's reasoning — fixing this was one of the biggest accuracy improvements.

---

## Known limitations

- **RPC batch timeout risk:** If a batch of 50 products is particularly description-heavy (many terms matching many SRS descriptions via GIN), a single batch could still approach the timeout. Decrease `RPC_BATCH_SIZE` in `config.ts` if this reappears.
- **AI verification cost:** Roughly $0.01 per 350-product run at Haiku pricing. Scales with the count of fuzzy + partial matches. Not metered per user.
- **No caching between runs:** Every upload re-runs the full SQL + AI pipeline. For the same input file run twice, results may vary slightly if Claude returns different reasoning.
- **No multi-account batch mode:** Designed for one account at a time. Running it for 10 accounts means 10 separate uploads.
- **Service detection is a whitelist:** Only exact-match on `['SERVICE', 'SERVICES', 'LABOR']` product types. If an account uses a non-standard type like `INSTALLATION`, those rows will be sent to SQL and likely return no match.

---

## Ownership

Built by the Customer Product Management Team. Maintained by Dilith (dilith@zuper.co).
