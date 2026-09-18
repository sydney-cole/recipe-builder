import { describe, expect, it } from "vitest";
import { dailyRecommendationRefreshEnabled } from "./featureFlags";

describe("dailyRecommendationRefreshEnabled", () => {
  it("keeps refreshes enabled when the flag is not configured", () => {
    expect(dailyRecommendationRefreshEnabled(undefined)).toBe(true);
    expect(dailyRecommendationRefreshEnabled(" ")).toBe(true);
  });

  it("can pause and resume refreshes per deployment", () => {
    expect(dailyRecommendationRefreshEnabled("false")).toBe(false);
    expect(dailyRecommendationRefreshEnabled(" TRUE ")).toBe(true);
  });

  it("rejects ambiguous values", () => {
    expect(() => dailyRecommendationRefreshEnabled("yes")).toThrow(
      "RECIPE_RECOMMENDATIONS_REFRESH_ENABLED must be true or false",
    );
  });
});
