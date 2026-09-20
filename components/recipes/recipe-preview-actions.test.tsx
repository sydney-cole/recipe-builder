import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipePreviewActions } from "./recipe-preview-actions";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.save,
  useQuery: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("RecipePreviewActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(null);
  });

  it("saves the preview without taking the user away from its actions", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RecipePreviewActions
        recipeId={"recipe-1" as never}
        isSaved={false}
        sourceUrl="https://example.com/recipe"
      />,
    );

    expect(container.querySelector(".recipe-preview-actions")).toHaveClass(
      "grid",
      "sm:grid-cols-2",
    );
    for (const name of ["Add to Recipe Book", "Set as current", "Add to grocery list", "View original"]) {
      expect(screen.getByRole(name === "View original" ? "link" : "button", { name })).toHaveClass(
        "h-full",
        "w-full",
      );
    }
    expect(screen.getByRole("link", { name: "View original" })).toHaveAttribute(
      "href",
      "https://example.com/recipe",
    );

    await user.click(screen.getByRole("button", { name: "Add to Recipe Book" }));

    expect(mocks.save).toHaveBeenCalledWith({ recipeId: "recipe-1" });
    expect(await screen.findByRole("button", { name: "In Recipe Book" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Added to your Recipe Book");
  });
});
