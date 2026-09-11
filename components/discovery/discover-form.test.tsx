import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverForm } from "./discover-form";

const mocks = vi.hoisted(() => ({ search: vi.fn(), queue: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", () => ({ useAction: () => mocks.search, useMutation: () => mocks.queue }));
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
};

describe("DiscoverForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({ query: "best rated recipe", recipes: [result] });
    mocks.queue.mockResolvedValue("import-123");
  });

  it("requires at least one search constraint", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("searches with one or more normalized constraints", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    const input = screen.getByPlaceholderText(/chicken, broccoli/);
    await user.type(input, "Chicken, Lemon");
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith({ terms: ["chicken", "lemon"] }));
    expect(await screen.findByText("Lemon chicken")).toBeInTheDocument();
    expect(screen.getByText("4.8 (210)")).toBeInTheDocument();
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

    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith({
      terms: ["broccoli", "cozy", "30-minute dinner", "italian", "spicy", "pasta"],
    }));
    expect(screen.queryByRole("button", { name: "Remove chicken thighs" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(6);
  });

  it("queues the selected result for the existing import pipeline", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);
    await user.click(screen.getByRole("button", { name: "chicken thighs" }));
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    await user.click(await screen.findByRole("button", { name: "Choose this recipe" }));
    expect(mocks.queue).toHaveBeenCalledWith({ sourceUrl: result.url, sourceQuery: "chicken thighs" });
    expect(mocks.push).toHaveBeenCalledWith("/app/imports");
  });
});
