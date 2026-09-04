import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DiscoverForm } from "./discover-form";

describe("DiscoverForm", () => {
  it("adds and removes search terms without creating duplicates", async () => {
    const user = userEvent.setup();
    render(<DiscoverForm />);

    expect(screen.getByText("3 ideas")).toBeInTheDocument();
    const spinach = screen.getByRole("button", { name: /spinach/i });
    await user.click(spinach);
    expect(screen.queryByRole("button", { name: /spinach/i })).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/chicken, broccoli/);
    await user.type(input, "Broccoli");
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    expect(screen.getAllByRole("button", { name: /broccoli/i })).toHaveLength(2);

    await user.type(input, "BROCCOLI");
    await user.click(screen.getByRole("button", { name: "Find recipes" }));
    expect(screen.getAllByRole("button", { name: /broccoli/i })).toHaveLength(2);
  });
});
