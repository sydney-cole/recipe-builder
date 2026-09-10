import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeReviewForm } from "./recipe-review-form";

const state = vi.hoisted(() => ({
  query: undefined as unknown,
  mutationCall: 0,
  save: vi.fn(),
  retry: vi.fn(),
  push: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => state.query,
  useMutation: () => (state.mutationCall++ % 2 === 0 ? state.save : state.retry),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));

const recipeImport = {
  _id: "import-1",
  _creationTime: 1,
  requestedBy: "user-1",
  sourceUrl: "https://example.com/pasta",
  normalizedUrl: "https://example.com/pasta",
  status: "parsed",
  attemptCount: 1,
  createdAt: 1,
  updatedAt: 1,
};

const draft = {
  _id: "draft-1",
  _creationTime: 1,
  importId: "import-1",
  sourceUrl: "https://example.com/pasta",
  title: "Generated pasta",
  cuisines: [],
  categories: [],
  keywords: [],
  ingredients: [
    { position: 0, originalText: "1 onion", name: "onion", normalizedName: "onion", quantity: 1, isOptional: false },
    { position: 1, originalText: "2 tomatoes", name: "tomatoes", normalizedName: "tomatoes", quantity: 2, isOptional: false },
  ],
  instructions: [
    { position: 0, text: "Chop." },
    { position: 1, text: "Cook." },
  ],
  modelId: "test-model",
  promptVersion: "v1",
  schemaVersion: "v1",
  generatedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe("RecipeReviewForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.query = { recipeImport, draft };
    state.mutationCall = 0;
    state.save.mockReset().mockResolvedValue("recipe-1");
    state.retry.mockReset().mockResolvedValue("import-1");
    state.push.mockReset();
  });

  it("reviews, corrects, reorders, removes, adds, and saves the generated draft", async () => {
    const user = userEvent.setup();
    render(<RecipeReviewForm importId={"import-1" as never} />);

    expect(screen.getByText(/AI-generated draft/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /original recipe source/i })).toHaveAttribute("href", recipeImport.sourceUrl);
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Corrected pasta");
    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    await user.click(screen.getByRole("button", { name: "Remove ingredient 2" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const ingredientNames = screen.getAllByLabelText("Ingredient name");
    await user.type(ingredientNames[1], "basil");
    const sourceTexts = screen.getAllByLabelText("Source text");
    await user.type(sourceTexts[1], "a handful basil");
    await user.click(screen.getByRole("button", { name: "Move instruction 2 up" }));
    await user.click(screen.getAllByRole("button", { name: "Save to Recipe Book" })[0]);

    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0].draft).toMatchObject({
      title: "Corrected pasta",
      ingredients: [
        expect.objectContaining({ name: "tomatoes" }),
        expect.objectContaining({ name: "basil", originalText: "a handful basil" }),
      ],
      instructions: [{ text: "Cook.", section: "" }, { text: "Chop.", section: "" }],
    });
    expect(state.push).toHaveBeenCalledWith("/app/recipe-book/recipe-1");
  });

  it("focuses invalid fields and retains edits after a save failure", async () => {
    const user = userEvent.setup();
    state.save.mockRejectedValueOnce(new Error("offline"));
    render(<RecipeReviewForm importId={"import-1" as never} />);
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.click(screen.getAllByRole("button", { name: "Save to Recipe Book" })[0]);
    expect(title).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(/add a recipe title/i);
    await user.type(title, "My retained edit");
    await user.click(screen.getAllByRole("button", { name: "Save to Recipe Book" })[0]);
    await screen.findByText(/edits are still here/i);
    expect(title).toHaveValue("My retained edit");
  });

  it("guards only dirty navigation and registers beforeunload protection", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<RecipeReviewForm importId={"import-1" as never} />);
    await user.click(screen.getByRole("button", { name: "Back to imports" }));
    expect(state.push).toHaveBeenCalledWith("/app/imports");
    state.push.mockClear();
    await user.type(screen.getByLabelText("Title"), " changed");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Back to imports" }));
    expect(state.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back to imports" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(state.push).toHaveBeenCalledWith("/app/imports");
  });

  it("renders safe loading, inaccessible, processing, failed, and completed states", async () => {
    const { rerender } = render(<RecipeReviewForm importId={"import-1" as never} />);
    state.query = undefined;
    rerender(<RecipeReviewForm importId={"import-1" as never} />);
    expect(screen.getByLabelText("Loading recipe review")).toBeInTheDocument();
    state.query = null;
    rerender(<RecipeReviewForm importId={"import-1" as never} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable or belongs/i);
    state.query = { recipeImport: { ...recipeImport, status: "scraping" }, draft: null };
    rerender(<RecipeReviewForm importId={"import-1" as never} />);
    expect(screen.getByText(/still processing/i)).toBeInTheDocument();
    state.query = { recipeImport: { ...recipeImport, status: "failed", errorMessage: "Safe failure", errorRetryable: true }, draft: null };
    rerender(<RecipeReviewForm importId={"import-1" as never} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Safe failure")).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Retry import" }));
    expect(state.retry).toHaveBeenCalled();
    state.query = { recipeImport: { ...recipeImport, status: "completed", recipeId: "recipe-1" }, draft: null };
    rerender(<RecipeReviewForm importId={"import-1" as never} />);
    expect(screen.getByRole("link", { name: "View saved recipe" })).toHaveAttribute("href", "/app/recipe-book/recipe-1");
  });
});
