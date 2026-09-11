import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailIntake } from "./email-intake";

const mocks = vi.hoisted(() => ({ provisionInbox: vi.fn() }));

vi.mock("convex/react", () => ({
  useAction: () => mocks.provisionInbox,
  useQuery: () => null,
}));

describe("EmailIntake", () => {
  it("shows inbox connection without direct-link or recent-import controls", () => {
    render(<EmailIntake />);

    expect(screen.getByRole("button", { name: "Connect recipe inbox" })).toBeInTheDocument();
    expect(screen.queryByText("Recent imports")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Recipe URL" })).not.toBeInTheDocument();
  });
});
