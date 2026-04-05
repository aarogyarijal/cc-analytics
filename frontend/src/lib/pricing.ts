// Model pricing data: input and cache_read prices per million tokens
export const MODEL_PRICING: Record<string, { input_per_mtok: number; cache_read_per_mtok: number }> = {
  "claude-sonnet-4-6": { input_per_mtok: 3.0, cache_read_per_mtok: 0.3 },
  "claude-opus-4-6": { input_per_mtok: 15.0, cache_read_per_mtok: 1.5 },
  "claude-haiku-4-5": { input_per_mtok: 0.8, cache_read_per_mtok: 0.08 },
  "claude-3-5-sonnet": { input_per_mtok: 3.0, cache_read_per_mtok: 0.3 },
  "claude-3-opus": { input_per_mtok: 15.0, cache_read_per_mtok: 1.5 },
};

/**
 * Calculate cache savings for a model given cache_read_tokens
 * Returns the dollar amount saved by using cached reads vs. fresh input tokens
 */
export function calculateCacheSavings(
  model: string | undefined,
  cache_read_tokens: number,
  fallback_blended_cost?: number
): number {
  if (!model || cache_read_tokens === 0) return 0;

  const pricing = MODEL_PRICING[model];
  if (pricing) {
    const delta = pricing.input_per_mtok - pricing.cache_read_per_mtok;
    return (cache_read_tokens * delta) / 1_000_000;
  }

  // Fallback: assume 90% discount on blended rate
  if (fallback_blended_cost !== undefined) {
    return (cache_read_tokens * fallback_blended_cost * 0.9) / 1_000_000;
  }
  return 0;
}
