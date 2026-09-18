const DEFAULT_FIRECRAWL_AGENT_MAX_CREDITS = 500;
const FIRECRAWL_PAID_REQUEST_THRESHOLD = 2_500;

export type FirecrawlAgentRequest = {
  prompt: string;
  urls?: string[];
  schema?: Record<string, unknown>;
  strictConstrainToURLs?: boolean;
  model?: "spark-2";
  effort?: "low" | "medium" | "high";
};

export type CreditLimitedFirecrawlAgentRequest = FirecrawlAgentRequest & {
  maxCredits: number;
};

/**
 * Resolve the per-run Firecrawl Agent credit ceiling.
 *
 * Firecrawl defaults an uncapped request to 2,500 credits. PerfectPlate uses a
 * deliberately lower default for development and rejects invalid values rather
 * than silently falling back to Firecrawl's larger default.
 */
export function firecrawlAgentMaxCredits(
  configuredValue = process.env.FIRECRAWL_AGENT_MAX_CREDITS,
): number {
  const normalized = configuredValue?.trim();
  if (!normalized) return DEFAULT_FIRECRAWL_AGENT_MAX_CREDITS;

  const parsed = Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > FIRECRAWL_PAID_REQUEST_THRESHOLD
  ) {
    throw new Error(
      `FIRECRAWL_AGENT_MAX_CREDITS must be a whole number from 1 to ${FIRECRAWL_PAID_REQUEST_THRESHOLD}`,
    );
  }

  return parsed;
}
/**
 * Build every Firecrawl Agent request with an enforced credit ceiling.
 * Callers cannot supply maxCredits themselves, so the deployment setting is
 * the single source of truth when the shared Firecrawl account changes.
 */
export function withFirecrawlMaxCredits(
  request: FirecrawlAgentRequest,
  configuredValue = process.env.FIRECRAWL_AGENT_MAX_CREDITS,
): CreditLimitedFirecrawlAgentRequest {
  return {
    ...request,
    maxCredits: firecrawlAgentMaxCredits(configuredValue),
  };
}
