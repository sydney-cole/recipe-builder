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
