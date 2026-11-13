import { isLikelyIndividualRecipePage, normalizeRecipeUrl } from "./urls";

export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SEARCH_RESULTS = 6;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;

export type RecipeSearchResult = {
  url: string;
  title: string;
  description: string;
  source: string;
};

export function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clipped(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

export function selectRecipeResults(rawResults: unknown): RecipeSearchResult[] {
  if (!Array.isArray(rawResults)) return [];
  const seen = new Set<string>();
  const selected: RecipeSearchResult[] = [];
  for (const raw of rawResults) {
    if (selected.length === MAX_SEARCH_RESULTS) break;
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const title = clipped(record.title, MAX_TITLE_LENGTH);
    if (typeof record.url !== "string" || !title) continue;

    let url: string;
    try {
      url = normalizeRecipeUrl(record.url);
    } catch {
      continue;
    }
    if (seen.has(url) || !isLikelyIndividualRecipePage(url, title)) continue;
    seen.add(url);
    selected.push({
      url,
      title,
      description: clipped(record.content, MAX_DESCRIPTION_LENGTH),
      source: new URL(url).hostname.replace(/^www\./, ""),
    });
  }
  return selected;
}
