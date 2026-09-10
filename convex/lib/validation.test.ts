import { describe, expect, it } from "vitest";
import {
  LIST_LIMITS,
  RECIPE_DRAFT_LIMITS,
  normalizeEmailAddress,
  normalizeListItem,
  safeImportError,
  validateRecipeDraft,
} from "./validation";

const validDraft = {
  title: " Tomato Pasta ",
  description: null,
  servings: 4,
  ingredients: [
    {
      originalText: "2 cups Tomatoes",
      name: " Tomatoes ",
      quantity: 2,
      unit: " CUPS ",
    },
  ],
  instructions: [{ text: " Simmer until tender. " }],
};

describe("recipe draft validation", () => {
  it("normalizes valid drafts while preserving absent optional values", () => {
    expect(validateRecipeDraft(validDraft)).toMatchObject({
      title: "Tomato Pasta",
      description: undefined,
      ingredients: [
        {
          position: 0,
          name: "Tomatoes",
          normalizedName: "tomatoes",
          unit: "cups",
          isOptional: false,
        },
      ],
      instructions: [{ position: 0, text: "Simmer until tender." }],
    });
  });

  it("rejects missing, malformed, and oversized values", () => {
    expect(() => validateRecipeDraft({ ...validDraft, title: "" })).toThrow(
      /title is required/i,
    );
    expect(() =>
      validateRecipeDraft({ ...validDraft, servings: Number.NaN }),
    ).toThrow(/servings/i);
    expect(() =>
      validateRecipeDraft({
        ...validDraft,
        ingredients: Array.from(
          { length: RECIPE_DRAFT_LIMITS.ingredients + 1 },
          () => validDraft.ingredients[0],
        ),
      }),
    ).toThrow(/too many ingredients/i);
  });
});

describe("shared normalization", () => {
  it("normalizes mailbox forms and rejects invalid senders", () => {
    expect(normalizeEmailAddress("Cook <COOK@Example.com>")).toBe(
      "cook@example.com",
    );
    expect(normalizeEmailAddress("not an email")).toBeNull();
    expect(normalizeEmailAddress(undefined)).toBeNull();
  });

  it("bounds grocery fields and classifies safe errors", () => {
    expect(
      normalizeListItem({ name: " Milk ", quantityText: "one carton", unit: " EA " }),
    ).toMatchObject({ name: "Milk", normalizedName: "milk", unit: "ea" });
    expect(() =>
      normalizeListItem({ name: "x".repeat(LIST_LIMITS.itemName + 1) }),
    ).toThrow(/too long/i);
    expect(safeImportError("rate_limited")).toEqual({
      category: "rate_limited",
      message: "Recipe processing is busy. Please try again shortly.",
      retryable: true,
    });
    expect(safeImportError("configuration").retryable).toBe(false);
  });
});
