import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecipeBookPage from "./page";

const queryState = vi.hoisted(() => ({
  value: undefined as unknown,
  createFromRecipe: vi.fn(),
  push: vi.fn(),
  search: "",
}));

vi.mock("convex/react", () => ({
  useQuery: () => queryState.value,
  useMutation: () => queryState.createFromRecipe,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: queryState.push }),
  useSearchParams: () => new URLSearchParams(queryState.search),
}));

const recipes = [
  {
    _id: "recipe-z",
    _creationTime: 2,
    sourceUrl: "https://example.com/z",
    normalizedSourceUrl: "https://example.com/z",
    title: "Zucchini Pasta",
    description: "Fast summer dinner",
    servings: 4,
    totalTimeMinutes: 15,
    sourceSite: "Garden Table",
    cuisines: [],
    categories: ["Dinner"],
    keywords: [],
    instructions: [],
    createdAt: 2,
    updatedAt: 2,
  },
  {
    _id: "recipe-a",
    _creationTime: 1,
    sourceUrl: "https://example.com/a",
    normalizedSourceUrl: "https://example.com/a",
    title: "Apple Oats",
    servings: 2,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    sourceSite: "Morning Table",
    cuisines: [],
    categories: ["Breakfast"],
    keywords: [],
    instructions: [],
    createdAt: 1,
    updatedAt: 1,
  },
];

describe("RecipeBookPage", () => {
  it("reserves space for the search icon", () => {
    render(<RecipeBookPage />);

    expect(screen.getByPlaceholderText("Search your Recipe Book")).toHaveClass(
      "search-input-with-icon",
    );
  });

  beforeEach(() => {
    queryState.value = recipes;
    queryState.createFromRecipe.mockReset().mockResolvedValue(null);
    queryState.push.mockReset();
    queryState.search = "";
  });

  it("renders loading and empty states", () => {
    queryState.value = undefined;
    const { rerender } = render(<RecipeBookPage />);
    expect(screen.getByLabelText("Loading recipes")).toBeInTheDocument();

    queryState.value = [];
    rerender(<RecipeBookPage />);
    expect(screen.getByRole("heading", { name: "No recipes found" })).toBeInTheDocument();
  });

  it("searches and sorts mapped backend recipes", async () => {
    const user = userEvent.setup();
    render(<RecipeBookPage />);
    expect(screen.getByText("2 recipes")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search your Recipe Book"), "morning");
    expect(screen.getByText("1 recipe")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Apple Oats" })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Search your Recipe Book"));
    await user.selectOptions(screen.getByRole("combobox"), "az");
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Apple Oats",
      "Zucchini Pasta",
    ]);
  });

  it("sets a selected recipe as current and returns home in change mode", async () => {
    const user = userEvent.setup();
    queryState.search = "select=current";
    render(<RecipeBookPage />);

    expect(screen.getByRole("heading", { name: "Change current recipe" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose Zucchini Pasta" }));

    expect(queryState.createFromRecipe).toHaveBeenCalledWith({ recipeId: "recipe-z" });
    expect(queryState.push).toHaveBeenCalledWith("/app");
  });
});
