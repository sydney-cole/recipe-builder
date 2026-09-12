import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({
  pathname: "/app/recipe-book",
  refresh: vi.fn(),
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

describe("AppShell", () => {
  beforeEach(() => {
    mocks.pathname = "/app/recipe-book";
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.signOut.mockReset().mockResolvedValue(undefined);
  });

  it("marks the current section and completes sign-out", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>Kitchen content</p></AppShell>);

    expect(screen.getByText("Kitchen content")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Recipe Book" })) {
      expect(link).toHaveAttribute("aria-current", "page");
    }

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/sign-in");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the user in place and exposes a recoverable sign-out error", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValueOnce(new Error("network unavailable"));
    render(<AppShell><p>Kitchen content</p></AppShell>);

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't sign out");
    expect(screen.getByRole("button", { name: "Log out" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
