import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RecipeCard } from "./recipe-card";
import type { Recipe } from "@/lib/data/types";

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
  it("links persisted recipes to details and grocery planning", () => {
    render(<RecipeCard recipe={recipe} />);
    expect(screen.getAllByRole("link", { name: /Green Orzo/ })[0]).toHaveAttribute(
      "href",
      "/app/recipe-book/orzo",
    );
    expect(screen.getByRole("button", { name: "Create list" })).toBeDisabled();
  });

  it("does not create broken detail links for preview cards", async () => {
    const user = userEvent.setup();
    render(<RecipeCard recipe={recipe} suggested detailsHref={null} />);
    expect(screen.queryByRole("link", { name: /View Green Orzo/ })).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Add to Recipe Book" });
    await user.click(save);
    expect(screen.getByRole("button", { name: "In Recipe Book" })).toBeDisabled();
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
});
