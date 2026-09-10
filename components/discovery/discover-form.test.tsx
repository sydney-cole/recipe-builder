import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiscoverForm } from "./discover-form";

describe("DiscoverForm", () => {
  it("labels sample recommendations as a non-persistent preview", () => {
    render(<DiscoverForm />);
    expect(screen.getByText("Discover is a preview")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Preview only" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /add to recipe book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /find recipes/i })).not.toBeInTheDocument();
  });
});
