/**
 * Daily recommendations can be paused per deployment without removing the
 * feature or changing manual discovery searches.
 */
export function dailyRecommendationRefreshEnabled(
  configuredValue = process.env.RECIPE_RECOMMENDATIONS_REFRESH_ENABLED,
): boolean {
  const normalized = configuredValue?.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(
    "RECIPE_RECOMMENDATIONS_REFRESH_ENABLED must be true or false",
  );
}
