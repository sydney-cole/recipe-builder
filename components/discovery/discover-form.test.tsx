import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverForm } from "./discover-form";

const mocks = vi.hoisted(() => ({ search: vi.fn(), create: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", () => ({
  useAction: () => mocks.search,
  useMutation: () => mocks.create,
  useQuery: () => null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const result = {
  url: "https://example.com/lemon-chicken",
  title: "Lemon chicken",
  description: "A bright weeknight dinner.",
  source: "example.com",
  rating: 4.8,
  ratingCount: 210,
  totalTimeMinutes: 35,
  matchReason: "Matches chicken and lemon.",
  matchedTerms: ["chicken", "lemon"],
  ingredients: ["1 pound chicken thighs", "1 lemon"],
  instructions: ["Season the chicken.", "Cook until golden and finish with lemon."],
};

describe("DiscoverForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({ query: "best rated recipe", recipes: [result] });
    mocks.create.mockResolvedValue("recipe-123");
  });

  it("requires at least one search constraint", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalledWith({ terms: [], mode: "search" });
    expect(screen.getByRole("heading", { name: "Demo recipes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Already have a recipe in mind?" })).toHaveClass("page-title");
    expect(screen.getByText(/create an editable recipe card/)).toBeInTheDocument();
  });

  it("loads temporary demo recipes without Firecrawl and opens complete recipe details", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);

    expect(mocks.search).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "View recipe" })[0]);

    expect(screen.getByRole("dialog")).toHaveTextContent("2 (15-ounce) cans chickpeas");
    expect(screen.getByRole("dialog")).toHaveTextContent("Fold in the spinach");
    expect(screen.getByRole("button", { name: "Choose recipe" })).toBeInTheDocument();
  });

  it("labels the temporary Firecrawl-free recipe source", () => {
    render(<DiscoverForm />);
    expect(screen.getByText(/Temporary complete recipes/)).toBeInTheDocument();
    expect(screen.getAllByText("Source: PerfectPlate Demo Kitchen")).toHaveLength(3);
  });

  it("adds clear spacing between the major discovery sections", async () => {
    const { container } = render(<DiscoverForm />);
    expect(screen.getAllByRole("button", { name: "View recipe" })).toHaveLength(3);
    expect(container.firstElementChild).toHaveClass("discovery-sections");
    expect(screen.getByRole("heading", { name: "Already have a recipe in mind?" }).parentElement).toHaveClass("known-recipe-heading");
    expect(screen.getByRole("heading", { name: "Demo recipes" }).closest("section")).toHaveClass("discovery-recommendations");
    expect(screen.getByRole("button", { name: "Find recipes" })).toHaveClass("button-lg", "w-full");
    expect(screen.getByRole("button", { name: "Import recipe" })).toHaveClass("button-lg", "w-full");
  });

  it("searches with one or more normalized constraints", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    const input = screen.getByPlaceholderText(/chicken, broccoli/);
    await user.type(input, "Chicken, Lemon");
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    expect(mocks.search).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Choose a recipe" })).toHaveTextContent("Sheet-Pan Lemon Herb Chicken");
  });

  it("accumulates selected constraints in the input and only removes chips with their remove buttons", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    await user.click(screen.getByRole("button", { name: "broccoli" }));
    await user.click(screen.getByRole("button", { name: "cozy" }));

    await user.click(screen.getByRole("button", { name: "Use broccoli in search field" }));
    await user.click(screen.getByRole("button", { name: "Use cozy in search field" }));
    expect(screen.getByPlaceholderText(/chicken, broccoli/)).toHaveValue("broccoli, cozy");
    await user.click(screen.getByRole("button", { name: "Use broccoli in search field" }));
    expect(screen.getByPlaceholderText(/chicken, broccoli/)).toHaveValue("broccoli, cozy");
    expect(screen.getByRole("button", { name: "Remove broccoli" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove broccoli" }));
    expect(screen.queryByRole("button", { name: "Remove broccoli" })).not.toBeInTheDocument();
  });

  it("keeps the six newest constraints when the visible limit is exceeded", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    for (const starter of ["chicken thighs", "broccoli", "cozy", "30-minute dinner"]) {
      await user.click(screen.getByRole("button", { name: starter }));
    }
    await user.type(screen.getByPlaceholderText(/chicken, broccoli/), "italian, spicy, pasta");
    await user.click(screen.getByRole("button", { name: "Find recipes" }));

    expect(mocks.search).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("button", { name: "Remove chicken thighs" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(6);
  });

  it("opens a selected search result as an unsaved recipe preview", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    await user.click(screen.getByRole("button", { name: "chicken thighs" }));
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    await user.click(await screen.findByRole("button", { name: "Choose recipe" }));
    expect(mocks.create).toHaveBeenCalledWith({
      url: "https://demo.perfectplate.example.com/recipes/sheet-pan-lemon-herb-chicken",
      title: "Sheet-Pan Lemon Herb Chicken",
      description: "Roasted chicken thighs, potatoes, and broccoli with plenty of lemon and herbs.",
      source: "PerfectPlate Demo Kitchen",
      totalTimeMinutes: 50,
      matchedTerms: ["chicken", "lemon", "broccoli"],
      ingredients: expect.arrayContaining(["1 1/2 pounds boneless chicken thighs", "1 lemon"]),
      instructions: expect.arrayContaining(["Heat the oven to 425°F and line a large sheet pan."]),
      sourceQuery: "chicken thighs",
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/app/recipes/recipe-123"));
  });
});
