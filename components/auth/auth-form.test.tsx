import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  next: "/app/imports",
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mocks.signIn }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams({ next: mocks.next }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.next = "/app/imports";
  });

  it("submits the password flow and honors a safe destination", async () => {
    mocks.signIn.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();
    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.signIn).toHaveBeenCalledWith("password", expect.any(FormData));
    expect(mocks.replace).toHaveBeenCalledWith("/app/imports");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not expose unexpected backend error details", async () => {
    mocks.signIn.mockRejectedValue(new Error("internal deployment detail"));
    const user = userEvent.setup();
    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t complete that request. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
