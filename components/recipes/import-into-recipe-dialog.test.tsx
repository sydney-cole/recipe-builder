import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { ImportIntoRecipeDialog } from "./import-into-recipe-dialog";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => (args === "skip" ? undefined : mocks.queries[getFunctionName(ref)]),
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue(null);
    return mocks.mutations[name];
  },
}));

const recipeId = "recipe-1" as Id<"recipes">;
const mutation = (name: string) => {
  mocks.mutations[`recipeCards:${name}`] ??= vi.fn().mockResolvedValue(null);
  return mocks.mutations[`recipeCards:${name}`];
};

function renderDialog(counts = { ingredientCount: 0, instructionCount: 0 }) {
  const onFilled = vi.fn();
  const onOpenChange = vi.fn();
  render(<ImportIntoRecipeDialog recipeId={recipeId} title="Chili" {...counts} open onOpenChange={onOpenChange} onFilled={onFilled} />);
  return { onFilled, onOpenChange };
}

async function submitLink() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Recipe link"), "https://example.com/best-chili");
  await user.click(screen.getByRole("button", { name: "Import" }));
  return user;
}

const preview = {
  recipe: { _id: "draft-1", title: "The Best Chili", sourceSite: "example.com", instructions: [{ position: 1, text: "Simmer." }] },
  ingredients: [{ _id: "i1", originalText: "1 lb beef" }, { _id: "i2", originalText: "1 can beans" }],
  saved: null,
  importReview: { importId: "import-1", status: "needs_review", warnings: ["Check the cooking time."] },
  canEdit: true,
};

describe("ImportIntoRecipeDialog", () => {
  beforeEach(() => {
    mocks.queries = {};
    mocks.mutations = {};
  });

  it("says when a link can't be imported", async () => {
    mutation("importIntoRecipe").mockRejectedValue(new Error("Paste a recipe link"));
    renderDialog();
    await submitLink();
    expect(mutation("importIntoRecipe")).toHaveBeenCalledWith({ recipeId, sourceUrl: "https://example.com/best-chili" });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t import that link.");
    expect(mutation("fillFromImport")).not.toHaveBeenCalled();
  });

  it("previews the import and, after a warning, replaces the recipe's contents with the title only if accepted", async () => {
    mutation("importIntoRecipe").mockResolvedValue("import-1");
    mocks.queries["email:importResult"] = { status: "needs_review", recipeId: "draft-1", sourceUrl: "https://example.com/best-chili" };
    mocks.queries["recipes:get"] = preview;
    const { onFilled, onOpenChange } = renderDialog({ ingredientCount: 3, instructionCount: 1 });
    const user = await submitLink();

    expect(screen.getByRole("heading", { name: "The Best Chili" })).toBeInTheDocument();
    expect(screen.getByText("2 ingredients · 1 step · example.com")).toBeInTheDocument();
    expect(screen.getByText("Check the cooking time.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Chili already has 3 ingredients and 1 step. Filling it replaces them");

    await user.click(screen.getByRole("checkbox", { name: "Rename to “The Best Chili”" }));
    await user.click(screen.getByRole("button", { name: "Replace recipe contents" }));
    expect(mutation("fillFromImport")).toHaveBeenCalledWith({ recipeId, importId: "import-1", useImportedTitle: true, replaceExisting: true });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onFilled).toHaveBeenCalledWith("Recipe filled in from the link.");
  });

  it("fills an empty recipe without a warning, keeping its title by default", async () => {
    mutation("importIntoRecipe").mockResolvedValue("import-1");
    mocks.queries["email:importResult"] = { status: "completed", recipeId: "draft-1", sourceUrl: "https://example.com/best-chili" };
    mocks.queries["recipes:get"] = { ...preview, importReview: null };
    renderDialog();
    const user = await submitLink();
    expect(screen.queryByRole("note")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Fill recipe" }));
    expect(mutation("fillFromImport")).toHaveBeenCalledWith({ recipeId, importId: "import-1", useImportedTitle: false, replaceExisting: false });
  });

  it("shows why an import failed and lets the user try another link", async () => {
    mutation("importIntoRecipe").mockResolvedValue("import-1");
    mocks.queries["email:importResult"] = { status: "failed", sourceUrl: "https://example.com/x", errorMessage: "recipe_scrape_failed" };
    renderDialog();
    const user = await submitLink();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t scrape a complete recipe from that website.");
    await user.click(screen.getByRole("button", { name: "Try another link" }));
    expect(screen.getByLabelText("Recipe link")).toBeInTheDocument();
    expect(mutation("fillFromImport")).not.toHaveBeenCalled();
  });
});
