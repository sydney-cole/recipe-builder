import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GroceryListsError from "./error";

describe("GroceryListsError", () => {
  it("offers a recoverable persisted-list failure state", async () => {
    const reset = vi.fn();
    render(<GroceryListsError error={new Error("offline")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/have not been changed/i);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
