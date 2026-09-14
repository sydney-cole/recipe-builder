import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeLinkImport } from "./recipe-link-import";

const mocks = vi.hoisted(() => ({
  queueUrl: vi.fn(),
  push: vi.fn(),
  result: {
    status: "completed",
    recipeId: "recipe-123",
    title: "Favorite recipe",
    description: "A complete imported recipe.",
    sourceUrl: "https://example.com/favorite-recipe",
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.queueUrl,
  useQuery: () => mocks.result,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("RecipeLinkImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueUrl.mockResolvedValue("import-123");
  });

  it("shows a pasted recipe result and opens its unsaved preview", async () => {
    const user = userEvent.setup();
    const { container } = render(<RecipeLinkImport />);

    const input = screen.getByRole("textbox", { name: "Recipe URL" });
    expect(container.firstElementChild).toHaveClass("discovery-import-card");
    expect(screen.getByRole("heading", { name: "Paste a recipe link" })).toHaveClass("font-display", "text-3xl", "font-semibold", "tracking-tight");
    expect(container.querySelector(".card-content")).toHaveClass("discovery-import-content");
    await user.type(input, "https://example.com/favorite-recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    await waitFor(() => expect(mocks.queueUrl).toHaveBeenCalledWith({
      sourceUrl: "https://example.com/favorite-recipe",
    }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("dialog", { name: "Recipe result" })).toHaveTextContent("Favorite recipe");
    await user.click(screen.getByRole("button", { name: "Choose recipe" }));
    expect(mocks.push).toHaveBeenCalledWith("/app/recipes/recipe-123");
  });

  it("shows a useful error when the recipe cannot be queued", async () => {
    mocks.queueUrl.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the URL and try again");
  });
});
