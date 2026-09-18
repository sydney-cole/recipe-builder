import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeCard } from "./recipe-card";
import type { Recipe } from "@/lib/data/types";

const mocks = vi.hoisted(() => ({ addToBook: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.addToBook,
  useQuery: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const recipe: Recipe = {
  id: "orzo",
  title: "Green Orzo",
  description: "A quick dinner",
  totalMinutes: 20,
  servings: 4,
  source: "Test Kitchen",
  tags: ["Dinner"],
  art: "garden",
};

describe("RecipeCard", () => {
  beforeEach(() => mocks.addToBook.mockReset().mockResolvedValue(null));
  it("links persisted recipes to details and grocery planning", () => {
    render(<RecipeCard recipe={recipe} canCreateGroceryList />);
    expect(screen.getAllByRole("link", { name: /Green Orzo/ })[0]).toHaveAttribute(
      "href",
      "/app/recipe-book/orzo",
    );
    expect(screen.getByText("In Recipe Book")).toBeInTheDocument();
    const groceryButton = screen.getByRole("button", { name: "Add to grocery list" });
    expect(groceryButton).toBeEnabled();
    expect(groceryButton).toHaveClass("recipe-card-grocery-action");
    expect(groceryButton).not.toHaveClass("whitespace-nowrap");
  });

  it("does not create broken detail links for preview cards", async () => {
    const user = userEvent.setup();
    render(<RecipeCard recipe={recipe} suggested detailsHref={null} />);
    expect(screen.queryByRole("link", { name: /View Green Orzo/ })).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Add to Recipe Book" });
    await user.click(save);
    expect(screen.getByText("In Recipe Book")).toBeInTheDocument();
    expect(mocks.addToBook).toHaveBeenCalledWith({ recipeId: "orzo" });
    expect(screen.getByRole("button", { name: "Add to grocery list" })).toBeEnabled();
  });

  it("shows a stored meal image and falls back to the default art if it fails", () => {
    const { container } = render(
      <RecipeCard
        recipe={{ ...recipe, imageUrl: "https://storage.example.com/orzo.jpg" }}
      />,
    );
    const image = container.querySelector(".food-art-image");
    expect(image).toHaveAttribute(
      "src",
      "https://storage.example.com/orzo.jpg",
    );
    fireEvent.error(image as HTMLImageElement);
    expect(container.querySelector(".food-art-image")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dinner" })).toHaveClass(
      "food-art",
      "garden",
    );
  });

  it("does not invent time or serving metadata when the source omitted it", () => {
    render(
      <RecipeCard
        recipe={{ ...recipe, totalMinutes: undefined, servings: undefined }}
      />,
    );
    expect(screen.queryByText(/\b0 min\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });
});
