import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeImportNotifications } from "./recipe-import-notifications";

const mocks = vi.hoisted(() => ({
  imports: [] as Array<Record<string, unknown>>,
  addToBook: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args?: { recipeId: string }) => args
    ? {
        recipe: {
          _id: args.recipeId,
          title: "Lemon pasta",
          description: "Bright and quick.",
          sourceSite: "example.com",
          categories: ["Dinner"],
          cuisines: [],
          instructions: [{ position: 1, text: "Boil the pasta." }],
        },
        ingredients: [{ _id: "ingredient-1", originalText: "8 oz pasta" }],
        saved: null,
      }
    : mocks.imports,
  useMutation: () => mocks.addToBook,
}));

describe("RecipeImportNotifications", () => {
  beforeEach(() => {
    mocks.imports = [];
    mocks.addToBook.mockReset().mockResolvedValue(null);
  });

  it("keeps processing visible and opens a completed recipe in a modal", async () => {
    mocks.imports = [{ _id: "import-1", status: "processing" }];
    const { rerender } = render(<RecipeImportNotifications />);
    expect(await screen.findByText("Creating your recipe card")).toBeInTheDocument();

    mocks.imports = [{ _id: "import-1", status: "completed", recipeId: "recipe-1" }];
    rerender(<RecipeImportNotifications />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "View recipe" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Lemon pasta");
    expect(screen.getByRole("dialog")).toHaveTextContent("8 oz pasta");
    await user.click(screen.getByRole("button", { name: "Add to Recipe Book" }));
    expect(mocks.addToBook).toHaveBeenCalledWith({ recipeId: "recipe-1" });
  });
});

