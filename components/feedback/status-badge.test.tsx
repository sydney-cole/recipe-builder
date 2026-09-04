import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each([
    ["active", "bg-primary-soft"],
    ["ready", "bg-primary-soft"],
    ["attention", "bg-red-50"],
    ["scraping", ""],
    ["pending", ""],
  ])("renders the %s state", (status, className) => {
    const { unmount } = render(<StatusBadge status={status} />);
    const badge = screen.getByText(status);
    if (className) expect(badge).toHaveClass(className);
    if (status === "scraping") {
      expect(badge.querySelector("svg")).toHaveClass("animate-spin");
    }
    unmount();
  });
});
