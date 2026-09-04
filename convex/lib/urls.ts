const MAX_URL_LENGTH = 2_048;
const MAX_LINKS_PER_MESSAGE = 10;
const TRACKING_PARAMETERS = new Set(["fbclid", "gclid"]);

export function normalizeRecipeUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    throw new Error("Recipe links must be between 1 and 2,048 characters");
  }

  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS recipe links are supported");
  }
  if (url.username || url.password) {
    throw new Error("Recipe links cannot contain credentials");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || TRACKING_PARAMETERS.has(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function stringField(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

export function recipeLinksFromMessage(message: unknown) {
  const content = [
    stringField(message, "extracted_text"),
    stringField(message, "text"),
    stringField(message, "extracted_html"),
    stringField(message, "html"),
    stringField(message, "preview"),
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n");

  const matches = content.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const normalized = matches.flatMap((match) => {
    try {
      return [normalizeRecipeUrl(match.replace(/[.,;:!?]+$/, ""))];
    } catch {
      return [];
    }
  });
  return [...new Set(normalized)].slice(0, MAX_LINKS_PER_MESSAGE);
}

export function optionalStringField(value: unknown, key: string) {
  return stringField(value, key);
}
