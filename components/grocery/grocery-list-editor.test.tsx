import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GroceryListEditor } from "./grocery-list-editor";

describe("GroceryListEditor", () => {
  it("adds, edits, checks, removes, and restores an item", async () => {
    const user = userEvent.setup();
    render(<GroceryListEditor />);

    expect(screen.getByText("5")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Add an ingredient"), "  Avocados  ");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const avocado = screen.getByDisplayValue("Avocados");
    expect(avocado).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Mark Avocados complete" }));
    expect(screen.getByText("5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Avocados" }));
    const status = screen.getByRole("status");
    expect(within(status).getByText(/Avocados/)).toBeInTheDocument();
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(screen.getByDisplayValue("Avocados")).toBeInTheDocument();
  });
});
