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

  it("reserves space for the email and password field icons", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByLabelText("Email")).toHaveClass("auth-input-with-icon");
    expect(screen.getByLabelText("Password")).toHaveClass("auth-input-with-icon");
  });

  it("links sign-in users to password recovery", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
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

  it.each([
    [
      "InvalidAccountId",
      "Account not found",
      "We couldn’t find an account with that email. Check the address or create a new account.",
    ],
    [
      "InvalidSecret",
      "Incorrect password",
      "That password isn’t correct. Check it and try again.",
    ],
    [
      "TooManyFailedAttempts",
      "Too many sign-in attempts",
      "Sign-in is temporarily locked for this account. Wait a little while, then try again.",
    ],
    [
      "Invalid credentials",
      "Email or password is incorrect",
      "Check your email and password, then try again.",
    ],
  ])("shows a specific sign-in message for %s", async (backendError, title, description) => {
    mocks.signIn.mockRejectedValue(new Error(`[CONVEX] Uncaught Error: ${backendError}`));
    const user = userEvent.setup();
    render(<AuthForm mode="sign-in" />);

    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(description);
  });

  it("explains when a sign-up email already has an account", async () => {
    mocks.signIn.mockRejectedValue(
      new Error("Account cook@example.com already exists"),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Name"), "Home Cook");
    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Account already exists");
    expect(alert).toHaveTextContent(
      "An account with this email already exists. Sign in instead, or use a different email.",
    );
  });
});
