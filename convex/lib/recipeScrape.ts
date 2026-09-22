const MAX_MARKDOWN_BYTES = 300_000;
const MAX_JSON_LD_BYTES = 100_000;
const MAX_JSON_LD_INPUT_BYTES = 250_000;
const MAX_JSON_LD_NODES = 2_000;
const MAX_METADATA_LENGTH = 2_000;

const textEncoder = new TextEncoder();

export type RecipeScrapePayload = {
  markdown: string;
  recipeJsonLd?: string;
  imageSourceUrl?: string;
  pageTitle?: string;
  pageDescription?: string;
  pageLanguage?: string;
  canonicalUrl?: string;
  contentType?: string;
  statusCode?: number;
  firecrawlWarning?: string;
  truncated: boolean;
};

export type RecipeStructuredData = {
  title: string | null;
  description: string | null;
  rating: number | null;
  ratingCount: number | null;
  totalTimeMinutes: number | null;
  ingredients: string[];
  instructions: string[];
};

function findRecipeNode(value: unknown) {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  let visited = 0;

  while (pending.length > 0 && visited < MAX_JSON_LD_NODES) {
    const current = pending.pop();
    visited += 1;
    if (typeof current !== "object" || current === null) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    const record = current as Record<string, unknown>;
    const type = record["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
      return record;
    }
    for (const child of Object.values(record)) {
      if (pending.length + visited >= MAX_JSON_LD_NODES) break;
      if (typeof child === "object" && child !== null) pending.push(child);
    }
  }
  return undefined;
}

function normalizedText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : undefined;
}

function finiteNumber(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function durationMinutes(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return undefined;
  const minutes =
    Number(match[1] ?? 0) * 1_440 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0) +
    Number(match[4] ?? 0) / 60;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10_080) {
    return undefined;
  }
  return Math.round(minutes);
}

function instructionTexts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(instructionTexts);
  const text = normalizedText(value);
  if (text) return [text];
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const directText = normalizedText(record.text);
  if (directText) return [directText];
  const nested = instructionTexts(record.itemListElement ?? record.steps);
  if (nested.length > 0) return nested;
  const name = normalizedText(record.name);
  return name ? [name] : [];
}

/**
 * Read the common Schema.org Recipe fields locally. This avoids paying for
 * Firecrawl JSON extraction when recipe sites already publish the same data as
 * JSON-LD in their HTML.
 */
export function parseRecipeStructuredData(
  recipeJsonLd: string | undefined,
): RecipeStructuredData | null {
  if (!recipeJsonLd) return null;
  try {
    const recipe = findRecipeNode(JSON.parse(recipeJsonLd));
    if (!recipe) return null;
    const ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient
          .map(normalizedText)
          .filter((value): value is string => value !== undefined)
          .slice(0, 200)
      : [];
    const instructions = instructionTexts(recipe.recipeInstructions).slice(
      0,
      100,
    );
    const aggregateRating =
      typeof recipe.aggregateRating === "object" && recipe.aggregateRating !== null
        ? (recipe.aggregateRating as Record<string, unknown>)
        : {};
    const rawRating = finiteNumber(aggregateRating.ratingValue);
    const rawRatingCount = finiteNumber(
      aggregateRating.ratingCount ?? aggregateRating.reviewCount,
    );
    return {
      title: normalizedText(recipe.name) ?? null,
      description: normalizedText(recipe.description)?.slice(0, 500) ?? null,
      rating:
        rawRating !== undefined && rawRating >= 0 && rawRating <= 5
          ? rawRating
          : null,
      ratingCount:
        rawRatingCount !== undefined && rawRatingCount >= 0
          ? Math.floor(rawRatingCount)
          : null,
      totalTimeMinutes: durationMinutes(recipe.totalTime) ?? null,
      ingredients,
      instructions,
    };
  } catch {
    return null;
  }
}

function imageCandidate(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = imageCandidate(item);
      if (candidate) return candidate;
    }
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return imageCandidate(record.url ?? record.contentUrl);
  }
  return undefined;
}

function normalizedImageUrl(value: unknown, baseUrl?: string) {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim(), baseUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function extractRecipeImageUrl(
  recipeJsonLd: string | undefined,
  metadata: Record<string, unknown>,
) {
  const baseUrl = optionalBoundedString(metadata.sourceURL ?? metadata.url);
  if (recipeJsonLd) {
    try {
      const recipe = findRecipeNode(JSON.parse(recipeJsonLd));
      const recipeImage = normalizedImageUrl(
        imageCandidate(recipe?.image),
        baseUrl,
      );
      if (recipeImage) return recipeImage;
    } catch {
      // Malformed JSON-LD falls through to Firecrawl's page metadata.
    }
  }
  return normalizedImageUrl(
    metadata.ogImage ??
      metadata["og:image"] ??
      metadata.twitterImage ??
      metadata["twitter:image"] ??
      metadata.image,
    baseUrl,
  );
}

function boundedUtf8(value: string, maxBytes: number) {
  if (textEncoder.encode(value).byteLength <= maxBytes) {
    return { value, truncated: false };
  }

  let low = 0;
  let high = value.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    if (textEncoder.encode(value.slice(0, midpoint)).byteLength <= maxBytes) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return { value: value.slice(0, low), truncated: true };
}

function optionalBoundedString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_METADATA_LENGTH) : undefined;
}

function hasRecipeType(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  let visited = 0;

  while (pending.length > 0 && visited < MAX_JSON_LD_NODES) {
    const current = pending.pop();
    visited += 1;
    if (typeof current !== "object" || current === null) continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const record = current as Record<string, unknown>;
    const type = record["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
      return true;
    }

    for (const child of Object.values(record)) {
      if (pending.length + visited >= MAX_JSON_LD_NODES) break;
      if (typeof child === "object" && child !== null) pending.push(child);
    }
  }
  return false;
}

export function extractRecipeJsonLd(html: unknown) {
  if (typeof html !== "string" || html.length === 0) return undefined;

  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (textEncoder.encode(candidate).byteLength > MAX_JSON_LD_INPUT_BYTES) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (!hasRecipeType(parsed)) continue;
      const bounded = boundedUtf8(JSON.stringify(parsed), MAX_JSON_LD_BYTES);
      return { value: bounded.value, truncated: bounded.truncated };
    } catch {
      // Invalid page-authored JSON-LD is ignored; markdown remains available.
    }
  }
  return undefined;
}

export function buildRecipeScrapePayload(document: Record<string, unknown>) {
  const markdown = optionalBoundedString(document.markdown);
  if (!markdown) {
    throw new Error("Firecrawl did not return readable recipe content");
  }

  const metadata =
    typeof document.metadata === "object" && document.metadata !== null
      ? (document.metadata as Record<string, unknown>)
      : {};
  const statusCode =
    typeof metadata.statusCode === "number" &&
    Number.isFinite(metadata.statusCode)
      ? metadata.statusCode
      : undefined;
  if (statusCode !== undefined && statusCode >= 400) {
    throw new Error(`Recipe page returned HTTP ${statusCode}`);
  }

  const boundedMarkdown = boundedUtf8(
    String(document.markdown).trim(),
    MAX_MARKDOWN_BYTES,
  );
  const jsonLd = extractRecipeJsonLd(document.html);
  const payload: RecipeScrapePayload = {
    markdown: boundedMarkdown.value,
    truncated: boundedMarkdown.truncated || jsonLd?.truncated === true,
  };

  if (jsonLd) payload.recipeJsonLd = jsonLd.value;
  payload.imageSourceUrl = extractRecipeImageUrl(jsonLd?.value, metadata);
  payload.pageTitle = optionalBoundedString(metadata.title);
  payload.pageDescription = optionalBoundedString(metadata.description);
  payload.pageLanguage = optionalBoundedString(metadata.language);
  payload.canonicalUrl = optionalBoundedString(
    metadata.sourceURL ?? metadata.url,
  );
  payload.contentType = optionalBoundedString(metadata.contentType);
  payload.firecrawlWarning = optionalBoundedString(document.warning);
  payload.statusCode = statusCode;
  return payload;
}
