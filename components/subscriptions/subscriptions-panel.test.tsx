import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SubscriptionsPanel } from "./subscriptions-panel";

describe("SubscriptionsPanel", () => {
  it("adds a normalized pending subscription", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsPanel />);
    await user.type(
      screen.getByPlaceholderText("https://favoritefoodblog.com/newsletter"),
      "https://fresh-table.example/newsletter",
    );
    await user.click(screen.getByRole("button", { name: "Add subscription" }));

    expect(screen.getByRole("heading", { name: "Fresh Table" })).toBeInTheDocument();
    expect(screen.getByText("fresh-table.example")).toBeInTheDocument();
  });
});
