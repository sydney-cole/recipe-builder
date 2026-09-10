import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubscriptionsPanel } from "./subscriptions-panel";

describe("SubscriptionsPanel", () => {
  it("presents examples without enrollment or management controls", () => {
    render(<SubscriptionsPanel />);
    expect(screen.getByText("Subscriptions are a preview")).toBeVisible();
    expect(screen.getAllByText(/example only/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /add subscription/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage/i })).not.toBeInTheDocument();
  });
});
