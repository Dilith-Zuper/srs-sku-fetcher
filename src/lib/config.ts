export const MATCHING = {
  // Score thresholds (mapped from pg_trgm similarity, including weights & boosts, capped at 1.0)
  SCORE_EXACT:     0.90,
  SCORE_FUZZY:     0.52,
  SCORE_NO_MATCH:  0.30,

  // SQL function returns up to this many candidates per input
  SQL_TOP_K:       3,

  // AI verification
  AI_BATCH_SIZE:           20,
  AI_BATCH_CONCURRENCY:    3,
  AI_MAX_TOKENS_PER_ITEM:  90,

  // Service detection — exact-match whitelist on productType.toUpperCase().trim()
  SERVICE_TYPES: ['SERVICE', 'SERVICES', 'LABOR'] as readonly string[],
} as const;

export function isServiceType(productType: string): boolean {
  const t = productType.toUpperCase().trim();
  return MATCHING.SERVICE_TYPES.includes(t);
}
