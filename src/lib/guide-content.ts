export interface StepGuide {
  title: string;
  description: string;
  steps: { heading: string; detail: string }[];
  faqs: { q: string; a: string }[];
}

export const GUIDES: Record<number, StepGuide> = {
  1: {
    title: 'Upload your Zuper product export',
    description:
      "Upload the Excel exported from Zuper's Product Report. The tool reads each row, separates parts from services, and previews likely duplicates before sending anything to the SRS catalog.",
    steps: [
      {
        heading: 'Export from Zuper',
        detail:
          'In Zuper, go to Settings → Products → Export and choose Excel format. You can also use the report exported from the Product Report screen.',
      },
      {
        heading: 'Drop the file or click to browse',
        detail:
          'Only .xlsx and .xls are accepted. The first sheet in the workbook is used. The tool reads column headers in the standard Product Report order — no renaming required.',
      },
      {
        heading: 'Review the counts',
        detail:
          'You will see Parts to match, Services (skipped — SRS catalog has no services), and Likely duplicates (same product name + brand + price appearing more than once).',
      },
      {
        heading: 'Run matching',
        detail:
          'Click the orange "Run matching →" button at the bottom of the preview to start. Matching takes a few seconds per 50 products.',
      },
    ],
    faqs: [
      {
        q: 'What does "services skipped" mean?',
        a: 'The SRS catalog only contains physical parts. Rows whose Product Type is SERVICE, SERVICES, or LABOR are kept in the final output Excel for completeness but never sent to the SRS matcher.',
      },
      {
        q: 'Why does the preview show a Specification column instead of Description?',
        a: 'Zuper exports usually put the supplier name (e.g. "ABC Supply") in the Description column and the actual product spec in column 9 (Specification). The tool uses Specification for matching — that\'s the real product description.',
      },
      {
        q: 'What is a likely duplicate?',
        a: 'Rows with the same normalized product name + brand + price. The tool still matches them independently; you should scan the output Excel for repeated SRS IDs and clean them up downstream.',
      },
      {
        q: 'My file isn\'t parsing — what now?',
        a: 'Confirm the columns match the Zuper Product Report format: Product No, Product ID, Product Name, Category, Type, Description, Brand, Specification, Trade Type, Quantity, UOM, ... Price. The tool reads the first sheet only.',
      },
    ],
  },

  2: {
    title: 'Matching in progress',
    description:
      'Two automated phases run back-to-back. PostgreSQL trigram matching finds candidate SRS products per row; Claude Haiku then verifies the ambiguous ones using product name, specification, brand, UOM, and options.',
    steps: [
      {
        heading: 'SQL matching',
        detail:
          'Products are sent to Supabase in batches of 50, 2 concurrent. For each row the DB returns up to 3 candidate SRS products, ranked by a weighted score: name 60%, specification 25%, brand 15%. This uses pg_trgm with GIN indexes — no full table scan, no client-side download.',
      },
      {
        heading: 'AI verification',
        detail:
          'Fuzzy and partial matches (the medium-confidence ones) are sent to Claude Haiku in batches of 20, 3 batches concurrent. Claude sees all 3 candidates per row and picks the best one (or none) using name, specification, brand, UOM, and options.',
      },
      {
        heading: 'Score adjustments',
        detail:
          'A Claude rejection demotes the row to "No Match". A Claude confirmation of a Partial match upgrades it to Fuzzy. If Claude picks alternative #2 or #3, that candidate is promoted to the top match.',
      },
      {
        heading: 'Wait for completion',
        detail:
          'Usually 3–8 seconds total for ~350 products. The terminal log shows what is happening; any error lines surface there in red.',
      },
    ],
    faqs: [
      {
        q: 'What does the match score mean?',
        a: 'A weighted similarity between the Zuper product and the SRS catalog entry, capped at 100%. Exact ≥ 90%, Fuzzy ≥ 52%, Partial ≥ 30%. Below 30% = No Match.',
      },
      {
        q: 'Why is Claude involved at all?',
        a: 'Trigram similarity is great at catching typos and small word reorderings but has no concept of size, color, or pack count. "Roof Cement 10oz" and "Roof Cement 32oz" score identically in pg_trgm — Claude looks at UOM and options to catch the mismatch.',
      },
      {
        q: 'What if Claude fails on some rows?',
        a: 'Those rows show a red "AI failed" badge in the results. The SQL match still stands but is unverified — review manually. The tool retries once with JSON repair before marking a row as failed.',
      },
      {
        q: 'Is the SRS catalog re-downloaded every run?',
        a: 'No. All matching happens server-side in Supabase via the match_srs_products_batch SQL function. The browser only sends ~50 product names + specifications per batch and gets the top 3 SRS matches back.',
      },
    ],
  },

  3: {
    title: 'Review match results',
    description:
      'Every Zuper product is paired with its top SRS match plus up to two alternatives. You can promote an alternative, mark a row as no-match, and download the final Excel.',
    steps: [
      {
        heading: 'Filter using the tabs',
        detail:
          'Tabs across the top let you focus: Exact (high confidence), Fuzzy / Partial (review these), No Match (none found above 30%), Services (skipped), Verified (Claude confirmed), AI Errors (only shows if Claude failed on any rows).',
      },
      {
        heading: 'Expand a row to see context',
        detail:
          'Click the ▸ arrow on the left of any row to expand. You\'ll see Claude\'s one-sentence reasoning plus up to 2 alternative SRS candidates returned by SQL.',
      },
      {
        heading: 'Override when needed',
        detail:
          'Click "Use #2 →" or "Use #3 →" to promote an alternative to the top match. Click "Mark as no match" to reject the SQL pick. Overridden rows are badged "Overridden" and counted in the header.',
      },
      {
        heading: 'Download the Excel',
        detail:
          'Click "Download Excel →" in the top-right. The file includes the chosen SRS match, both alternatives, AI verdict + reason, score, and an Overridden column.',
      },
    ],
    faqs: [
      {
        q: 'What do the AI badges mean — ✓ / ✗ / ? / failed?',
        a: 'AI ✓ = Claude confirmed same product. AI ✗ = Claude said different product (row already downgraded to No Match). AI ? = Claude was not confident enough to decide — keep but review. AI failed (red) = Claude API errored or returned malformed JSON; the SQL match stands but is unverified.',
      },
      {
        q: 'Which rows should I focus on first?',
        a: 'Open the Partial and Fuzzy tabs and filter for AI ? badges. Those are the rows where the tool is least sure. Also check the AI Errors tab if it appears.',
      },
      {
        q: 'Why are SRS columns blank for No Match rows?',
        a: 'The SQL either returned nothing or scored below 30%. The original score is retained in the data but hidden in the table for No Match rows so they don\'t mislead you.',
      },
      {
        q: 'Can I redo matching with different settings?',
        a: 'Click "← New file" in the header to go back to upload. Thresholds (Exact ≥ 90%, Fuzzy ≥ 52%, Partial ≥ 30%) and signal weights (name 60% / specification 25% / brand 15%) live in src/lib/config.ts and supabase/setup.sql — edit and re-deploy to tune.',
      },
      {
        q: 'How do I trust the result?',
        a: 'The Excel includes the AI Reason column (Claude\'s one-sentence justification) and both alternatives, so a reviewer can sanity-check any row without re-running the tool.',
      },
    ],
  },
};
