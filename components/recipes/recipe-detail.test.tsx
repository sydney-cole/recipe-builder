import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeDetail } from "./recipe-detail";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), replace: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery: () => ({
    recipe: {
      _id: "recipe-1",
      _creationTime: 1,
      importId: "import-1",
      sourceUrl: "https://example.com/soup",
      normalizedSourceUrl: "https://example.com/soup",
      title: "Tomato soup",
      description: "A cozy soup",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      cuisines: [],
      categories: ["Dinner"],
      keywords: [],
      instructions: [{ position: 1, text: "Simmer." }],
      createdAt: 1,
      updatedAt: 1,
    },
    ingredients: [{
      _id: "ingredient-1",
      _creationTime: 1,
      recipeId: "recipe-1",
      position: 1,
      originalText: "4 tomatoes",
      name: "Tomatoes",
      normalizedName: "tomatoes",
      quantity: 4,
      isOptional: false,
    }],
    saved: { notes: "Add basil", isFavorite: false },
    importReview: {
      importId: "import-1",
      status: "needs_review",
      warnings: ["Check the cooking time."],
      generatedGroceryListId: "list-1",
    },
  }),
  useMutation: () => mocks.mutation,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

describe("RecipeDetail", () => {
  beforeEach(() => {
    mocks.mutation.mockReset().mockResolvedValue(null);
    mocks.replace.mockReset();
  });

  it("connects review, grocery handoff, and recipe editing", async () => {
    const user = userEvent.setup();
    render(<RecipeDetail recipeId="recipe-1" />);

    expect(screen.getByText("Check the cooking time.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to grocery list" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark review complete" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId: "recipe-1" });

    await user.click(screen.getByRole("button", { name: "Edit recipe" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Roasted tomato soup");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: "recipe-1",
        title: "Roasted tomato soup",
        instructions: [{ position: 1, text: "Simmer." }],
      }),
    );
  });
});
