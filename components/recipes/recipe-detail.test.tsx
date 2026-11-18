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
    canEdit: true,
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
    expect(screen.queryByRole("button", { name: "Add to grocery list" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Tags"), "Weeknight{Enter}");
    await user.click(screen.getByRole("button", { name: "Remove tag Dinner" }));
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: "recipe-1",
        title: "Roasted tomato soup",
        instructions: [{ position: 1, text: "Simmer." }],
        categories: ["Weeknight"],
      }),
    );
    expect(screen.getByRole("button", { name: "Edit recipe" })).toBeInTheDocument();
  });

  it("confirms removal in a dialog and carries scaled servings to the grocery list", async () => {
    const user = userEvent.setup();
    render(<RecipeDetail recipeId="recipe-1" />);

    await user.click(screen.getByRole("button", { name: "Increase servings" }));
    await user.click(screen.getByRole("button", { name: "Add to grocery list" }));
    expect(screen.getByText(/Amounts will be scaled for 5 servings/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await user.click(screen.getByRole("button", { name: "Favorite" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId: "recipe-1", isFavorite: true });

    await user.click(screen.getByRole("button", { name: "Remove recipe" }));
    expect(screen.getByRole("heading", { name: "Remove this recipe?" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId: "recipe-1" });
    expect(mocks.replace).toHaveBeenCalledWith("/app/recipe-book");
  });

  it("uploads a photo when the recipe has none", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ storageId: "storage-1" })));
    vi.stubGlobal("fetch", fetchMock);
    mocks.mutation.mockResolvedValueOnce("https://upload.example.com").mockResolvedValueOnce(true);
    render(<RecipeDetail recipeId="recipe-1" />);

    await user.click(screen.getByRole("button", { name: "Edit recipe" }));
    const photo = new File(["photo"], "soup.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Recipe photo"), photo);

    expect(fetchMock).toHaveBeenCalledWith("https://upload.example.com", expect.objectContaining({ method: "POST", body: photo }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId: "recipe-1", storageId: "storage-1" });
    expect(await screen.findByText("Photo added.")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("offers to fill the owner's recipe from a link, and a removal button of full touch size", async () => {
    const user = userEvent.setup();
    render(<RecipeDetail recipeId="recipe-1" />);
    expect(screen.getByRole("button", { name: "Remove recipe" })).toHaveClass("button-destructive", "remove-recipe-button");
    await user.click(screen.getByRole("button", { name: "Import from link" }));
    expect(screen.getByRole("dialog", { name: "Import Tomato soup from a link" })).toBeInTheDocument();
  });
});
