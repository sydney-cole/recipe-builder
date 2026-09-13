import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeLinkImport } from "./recipe-link-import";

const mocks = vi.hoisted(() => ({ queueUrl: vi.fn() }));

vi.mock("convex/react", () => ({ useMutation: () => mocks.queueUrl }));

describe("RecipeLinkImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueUrl.mockResolvedValue("import-123");
  });

  it("queues a pasted recipe URL and confirms where the recipe will appear", async () => {
    const user = userEvent.setup();
    const { container } = render(<RecipeLinkImport />);

    const input = screen.getByRole("textbox", { name: "Recipe URL" });
    expect(container.firstElementChild).toHaveClass("discovery-import-card");
    expect(screen.getByRole("heading", { name: "Paste a recipe link" })).toHaveClass("font-display", "text-3xl", "font-semibold", "tracking-tight");
    expect(container.querySelector(".card-content")).toHaveClass("discovery-import-content");
    await user.type(input, "https://example.com/favorite-recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    await waitFor(() => expect(mocks.queueUrl).toHaveBeenCalledWith({
      sourceUrl: "https://example.com/favorite-recipe",
    }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("ready to view");
  });

  it("shows a useful error when the recipe cannot be queued", async () => {
    mocks.queueUrl.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the URL and try again");
  });
});
