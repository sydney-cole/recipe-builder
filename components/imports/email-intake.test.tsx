import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailIntake } from "./email-intake";

const mocks = vi.hoisted(() => ({
  inbox: null as null | { _id: string; email: string },
  recentEmails: [] as Array<{
    _id: string;
    subject?: string;
    sender?: string;
    receivedAt: number;
    linkCount: number;
    status: "imported" | "processing" | "failed" | "already_imported";
    recipeId?: string;
  }>,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    email: { currentInbox: "currentInbox", recentInboundEmails: "recentInboundEmails" },
    recipes: { get: "recipeGet", currentId: "currentRecipeId" },
    recipeCards: { addToBook: "addToBook", setCurrent: "setCurrent" },
    groceryLists: {
      listMine: "groceryLists",
      createFromRecipe: "createFromRecipe",
      addRecipeToList: "addRecipeToList",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: string) => {
    if (reference === "currentInbox") return mocks.inbox;
    if (reference === "recentInboundEmails") return mocks.recentEmails;
    if (reference === "currentRecipeId") return null;
    if (reference === "groceryLists") return [];
    return {
      recipe: {
        _id: "recipe-1",
        title: "Weeknight pasta",
        description: "A quick pasta dinner.",
        sourceSite: "example.com",
        categories: ["Dinner"],
        cuisines: [],
        instructions: [{ position: 1, text: "Boil the pasta." }],
      },
      ingredients: [{ _id: "ingredient-1", originalText: "8 oz pasta" }],
      saved: null,
    };
  },
  useMutation: () => vi.fn().mockResolvedValue(null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("EmailIntake", () => {
  beforeEach(() => {
    mocks.inbox = null;
    mocks.recentEmails = [];
  });

  it("does not expose inbox connection or provisioning controls", () => {
    render(<EmailIntake />);

    expect(screen.queryByRole("button", { name: /connect recipe inbox/i })).not.toBeInTheDocument();
    expect(screen.getByText("The shared PerfectPlate inbox is not configured on this deployment.")).toBeInTheDocument();
  });

  it("shows the forwarding address and recent email history", () => {
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    mocks.recentEmails = [{
      _id: "email-1",
      subject: "Weeknight pasta",
      sender: "friend@example.com",
      receivedAt: Date.UTC(2026, 8, 18, 12, 0),
      linkCount: 1,
      status: "imported",
      recipeId: "recipe-1",
    }];

    render(<EmailIntake />);

    expect(screen.getByText("recipes@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByText("Weeknight pasta")).toBeInTheDocument();
    expect(screen.getByText("Recipes imported")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View recipe" })).toBeInTheDocument();
  });

  it("shows a useful empty state before any email is forwarded", () => {
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    render(<EmailIntake />);
    expect(screen.getByText("No forwarded emails yet")).toBeInTheDocument();
  });

  it("opens the imported recipe in a preview dialog", async () => {
    const user = userEvent.setup();
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    mocks.recentEmails = [{
      _id: "email-1",
      subject: "Weeknight pasta",
      receivedAt: Date.UTC(2026, 8, 18, 12, 0),
      linkCount: 1,
      status: "imported",
      recipeId: "recipe-1",
    }];

    render(<EmailIntake />);
    await user.click(screen.getByRole("button", { name: "View recipe" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weeknight pasta" })).toBeInTheDocument();
    expect(screen.getByText("8 oz pasta")).toBeInTheDocument();
    expect(screen.getByText("Boil the pasta.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to grocery list" })).toBeInTheDocument();
  });

  it("shows one email-received loading indicator while a recipe is processing", () => {
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    mocks.recentEmails = [{
      _id: "email-1",
      subject: "Pasta recipe",
      receivedAt: Date.UTC(2026, 8, 18, 12, 0),
      linkCount: 1,
      status: "processing",
    }];

    render(<EmailIntake />);

    expect(screen.getByText("Email received")).toBeInTheDocument();
    expect(screen.getByText("Creating recipe card…")).toBeInTheDocument();
  });

  it("labels an email with no downloadable recipe as failed", () => {
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    mocks.recentEmails = [{
      _id: "email-1",
      subject: "Recipe",
      receivedAt: Date.UTC(2026, 8, 18, 12, 0),
      linkCount: 3,
      status: "failed",
    }];

    render(<EmailIntake />);

    expect(screen.getByText("Recipe failed to download")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View recipe" })).not.toBeInTheDocument();
  });

  it("does not show a redundant already-imported badge", () => {
    mocks.inbox = { _id: "inbox-1", email: "recipes@example.com" };
    mocks.recentEmails = [{
      _id: "email-1",
      subject: "Pasta recipe",
      receivedAt: Date.UTC(2026, 8, 18, 12, 0),
      linkCount: 1,
      status: "already_imported",
      recipeId: "recipe-1",
    }];

    render(<EmailIntake />);

    expect(screen.queryByText("Recipes already imported")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View recipe" })).toBeInTheDocument();
  });
});
