// Matching typed text against recipe and meal names for the planner's
// picker. Pure, so it is easy to test and cheap to run on every keystroke.

/** Lowercase, without accents, with every run of other characters as one space. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Substring matches inside a word need at least this many characters ("p" must not offer "Shrimp"). */
const SUBSTRING_MIN = 3;

/**
 * How well `query` matches `name`: 0 the same name, 1 the start of the name,
 * 2 the start of words in order ("shr pep" for "Shrimp Peperonata"), 3
 * elsewhere inside it; null for no match.
 */
export function matchRank(query: string, name: string): 0 | 1 | 2 | 3 | null {
  const wanted = normalizeForMatch(query);
  if (!wanted) return null;
  const candidate = normalizeForMatch(name);
  if (candidate === wanted) return 0;
  if (candidate.startsWith(wanted)) return 1;
  const words = candidate.split(" ");
  let next = 0;
  const startsWords = wanted.split(" ").every((part) => {
    while (next < words.length && !words[next].startsWith(part)) next += 1;
    if (next === words.length) return false;
    next += 1;
    return true;
  });
  if (startsWords) return 2;
  if (wanted.length >= SUBSTRING_MIN && candidate.includes(wanted)) return 3;
  return null;
}

/** The items whose name matches `query`, best first and then alphabetical, at most `limit`. */
export function rankByName<T>(items: readonly T[], query: string, nameOf: (item: T) => string, limit: number): T[] {
  const ranked: { item: T; rank: number; name: string }[] = [];
  for (const item of items) {
    const name = nameOf(item);
    const rank = matchRank(query, name);
    if (rank !== null) ranked.push({ item, rank, name });
  }
  ranked.sort((first, second) => first.rank - second.rank || first.name.localeCompare(second.name));
  return ranked.slice(0, limit).map(({ item }) => item);
}
