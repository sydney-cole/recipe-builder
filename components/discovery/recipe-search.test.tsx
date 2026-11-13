import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeSearch } from "./recipe-search";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  queueDiscoveredUrl: vi.fn(),
  push: vi.fn(),
  importStarted: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.search,
  useMutation: () => mocks.queueDiscoveredUrl,
  useQuery: (_query: unknown, args: unknown) =>
    args === "skip"
      ? undefined
      : { status: "completed", recipeId: "recipe-123", title: "Smoky Lentil Stew", sourceUrl: "https://example.com/stew" },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const stew = {
  url: "https://example.com/recipes/smoky-lentil-stew",
  title: "Smoky Lentil Stew",
  description: "A weeknight stew.",
  source: "example.com",
};

async function searchFor(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole("searchbox", { name: "Recipe search" }), text);
  await user.click(screen.getByRole("button", { name: "Search recipes" }));
}

describe("RecipeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue([stew]);
    mocks.queueDiscoveredUrl.mockResolvedValue("import-123");
  });

  it("lists search results and imports the chosen recipe", async () => {
    window.addEventListener("perfectplate:recipe-import-started", mocks.importStarted);
    const user = userEvent.setup();
    render(<RecipeSearch />);

    await searchFor(user, "  lentil stew ");
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith({ query: "lentil stew" }));

    const results = await screen.findByRole("list", { name: "Recipes for lentil stew" });
    expect(within(results).getByRole("heading", { name: "Smoky Lentil Stew" })).toBeInTheDocument();
    expect(within(results).getByText("example.com")).toBeInTheDocument();
    expect(within(results).getByRole("link", { name: "View original" })).toHaveAttribute("href", stew.url);

    await user.click(within(results).getByRole("button", { name: "Import recipe" }));
    await waitFor(() => expect(mocks.queueDiscoveredUrl).toHaveBeenCalledWith({
      sourceUrl: stew.url,
      sourceQuery: "lentil stew",
    }));
    expect(mocks.importStarted).toHaveBeenCalledTimes(1);

    const dialog = await screen.findByRole("dialog", { name: "Recipe result" });
    await user.click(within(dialog).getByRole("button", { name: "Choose recipe" }));
    expect(mocks.push).toHaveBeenCalledWith("/app/recipes/recipe-123");
    window.removeEventListener("perfectplate:recipe-import-started", mocks.importStarted);
  });

  it("explains when nothing matches", async () => {
    mocks.search.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RecipeSearch />);

    await searchFor(user, "zzzz");
    expect(await screen.findByText("No recipes found")).toBeInTheDocument();
  });

  it("shows specific messages for quota, configuration, and general failures", async () => {
    const user = userEvent.setup();
    render(<RecipeSearch />);

    mocks.search.mockRejectedValueOnce(new ConvexError({ code: "search_quota_exceeded" }));
    await searchFor(user, "stew");
    expect(await screen.findByRole("alert")).toHaveTextContent("reached its limit");

    mocks.search.mockRejectedValueOnce(new ConvexError({ code: "search_not_configured" }));
    await user.click(screen.getByRole("button", { name: "Search recipes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("isn’t set up yet"));

    mocks.search.mockRejectedValueOnce(new Error("offline"));
    await user.click(screen.getByRole("button", { name: "Search recipes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please try again"));
  });

  it("reports a recipe that could not be queued", async () => {
    mocks.queueDiscoveredUrl.mockRejectedValue(new Error("invalid"));
    const user = userEvent.setup();
    render(<RecipeSearch />);

    await searchFor(user, "stew");
    await user.click(await screen.findByRole("button", { name: "Import recipe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try another result");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
