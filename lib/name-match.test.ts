import { describe, expect, it } from "vitest";
import { matchRank, normalizeForMatch, rankByName } from "./name-match";

describe("normalizeForMatch", () => {
  it("lowercases, drops accents and punctuation, and collapses spaces", () => {
    expect(normalizeForMatch("  Crème-Brûlée,  Grandma's! ")).toBe("creme brulee grandma s");
  });
});

describe("matchRank", () => {
  it("ranks exact, then whole-name prefix, then word starts, then substrings", () => {
    expect(matchRank("chili", "Chili!")).toBe(0);
    expect(matchRank("chi", "Chili con carne")).toBe(1);
    expect(matchRank("pep", "Shrimp Peperonata")).toBe(2);
    expect(matchRank("shr pep", "Shrimp Peperonata")).toBe(2);
    expect(matchRank("ron", "Shrimp Peperonata")).toBe(3);
  });

  it("does not offer a one- or two-letter match from the middle of a word", () => {
    expect(matchRank("p", "Shrimp")).toBeNull();
    expect(matchRank("im", "Shrimp")).toBeNull();
    expect(matchRank("p", "Shrimp Peperonata")).toBe(2);
    expect(matchRank("rim", "Shrimp")).toBe(3);
  });

  it("matches nothing for an empty query or missing words", () => {
    expect(matchRank("", "Chili")).toBeNull();
    expect(matchRank("  ", "Chili")).toBeNull();
    expect(matchRank("tofu", "Chili")).toBeNull();
    expect(matchRank("chili beans", "Chili")).toBeNull();
  });
});

describe("rankByName", () => {
  const titles = ["Shrimp", "Pasta bake", "Shrimp Peperonata", "Pasta", "Pepper steak", "Grape salad"];
  const rank = (query: string, limit = 10) => rankByName(titles, query, (title) => title, limit);

  it("lists better matches first, alphabetically within a rank", () => {
    expect(rank("pa")).toEqual(["Pasta", "Pasta bake"]);
    expect(rank("p")).toEqual(["Pasta", "Pasta bake", "Pepper steak", "Shrimp Peperonata"]);
    expect(rank("pe")).toEqual(["Pepper steak", "Shrimp Peperonata"]);
    expect(rank("ape")).toEqual(["Grape salad"]);
  });

  it("keeps at most `limit` matches", () => {
    expect(rank("p", 2)).toEqual(["Pasta", "Pasta bake"]);
  });
});
