import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManualRecipeDialog } from "./manual-recipe-dialog";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));

describe("ManualRecipeDialog", () => {
  it("creates a recipe from one-line-per-item fields", async () => {
    mocks.create.mockResolvedValueOnce("recipe-manual");
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<ManualRecipeDialog open onOpenChange={vi.fn()} onCreated={onCreated} initialSourceUrl="https://example.com/blocked" />);

    await user.type(screen.getByLabelText("Recipe title"), "Family pancakes");
    await user.type(screen.getByLabelText("Ingredients"), "2 cups flour\n2 eggs");
    await user.type(screen.getByLabelText("Instructions"), "Mix everything.\nCook on a griddle.");
    await user.click(screen.getByRole("button", { name: "Add to Recipe Book" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Family pancakes",
      sourceUrl: "https://example.com/blocked",
      ingredients: ["2 cups flour", "2 eggs"],
      instructions: ["Mix everything.", "Cook on a griddle."],
    })));
    expect(onCreated).toHaveBeenCalledWith("recipe-manual");
  });
});

