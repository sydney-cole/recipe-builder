import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RecipeBookError from "./error";

describe("RecipeBookError", () => {
  it("offers a recoverable collection failure state", async () => {
    const reset = vi.fn();
    render(<RecipeBookError error={new Error("offline")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/has not been changed/i);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
