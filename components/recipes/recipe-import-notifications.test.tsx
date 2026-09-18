import { render, screen, waitFor } from "@testing-library/react";
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

  it("keeps processing visible and removes the notification when the recipe completes", async () => {
    mocks.imports = [{ _id: "import-1", status: "processing" }];
    const { rerender } = render(<RecipeImportNotifications />);
    expect(await screen.findByText("Creating your recipe card")).toBeInTheDocument();

    mocks.imports = [{ _id: "import-1", status: "completed", recipeId: "recipe-1" }];
    rerender(<RecipeImportNotifications />);
    await waitFor(() => expect(screen.queryByText("Creating your recipe card")).not.toBeInTheDocument());
    expect(screen.queryByText("Your recipe is ready")).not.toBeInTheDocument();
  });

  it("shows one notification for multiple URLs discovered in the same email", async () => {
    mocks.imports = [
      { _id: "import-1", sourceEventId: "email-1", status: "processing" },
      { _id: "import-2", sourceEventId: "email-1", status: "processing" },
      { _id: "import-3", sourceEventId: "email-1", status: "processing" },
    ];

    render(<RecipeImportNotifications />);

    expect(await screen.findAllByText("Creating your recipe card")).toHaveLength(1);
  });

  it("uses the same failure language as the Discover link importer", async () => {
    const { rerender } = render(<RecipeImportNotifications />);
    mocks.imports = [{
      _id: "import-1",
      status: "failed",
      errorMessage: "firecrawl_request_failed",
    }];
    rerender(<RecipeImportNotifications />);

    expect(await screen.findByText("Recipe import failed")).toBeInTheDocument();
    expect(screen.getByText("We couldn’t scrape a complete recipe from that website.")).toBeInTheDocument();
  });
});
