import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const mocks = vi.hoisted(() => ({ summary: undefined as unknown }));

vi.mock("convex/react", () => ({ useQuery: () => mocks.summary }));

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.summary = undefined;
  });

  it("shows a real loading state", () => {
    render(<DashboardPage />);
    expect(screen.getByLabelText("Loading dashboard")).toBeVisible();
    expect(screen.queryByText(/19 recipes/i)).not.toBeInTheDocument();
  });

  it("centers the first-run state on importing", () => {
    mocks.summary = {
      recipeCount: 0,
      importCount: 0,
      needsAttention: 0,
      processingCount: 0,
      recentRecipes: [],
    };
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Start with a recipe link" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Import your first recipe" })).toHaveAttribute("href", "/app/imports");
  });

  it("renders persisted processing, attention, and collection summaries", () => {
    mocks.summary = {
      recipeCount: 1,
      importCount: 3,
      needsAttention: 1,
      processingCount: 2,
      recentRecipes: [
        {
          savedAt: 1,
          recipe: {
            _id: "recipe-1",
            title: "Saved Soup",
            categories: ["Dinner"],
            sourceSite: "Example",
          },
        },
      ],
    };
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Saved Soup" })).toBeVisible();
    expect(screen.getByText("1 import needs attention")).toBeVisible();
    expect(screen.getByText("2 currently processing.")).toBeVisible();
    expect(screen.getByText("1 recipe in your book")).toBeVisible();
  });
});
