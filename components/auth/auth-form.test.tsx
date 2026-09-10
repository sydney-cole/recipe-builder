import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    mocks.signIn.mockReset();
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
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

  it("confirms a newly issued email verification code", async () => {
    mocks.signIn
      .mockResolvedValueOnce({ signingIn: false })
      .mockResolvedValueOnce({ signingIn: true });
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Name"), "Cook");
    await user.type(screen.getByLabelText("Email"), "COOK@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    const codeInput = screen.getByLabelText("Verification code");
    await user.type(codeInput, "123456");
    fireEvent.submit(codeInput.closest("form")!);

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledTimes(2));
    const verificationData = mocks.signIn.mock.calls[1][1] as FormData;
    expect(verificationData.get("flow")).toBe("email-verification");
    expect(verificationData.get("email")).toBe("cook@example.com");
    expect(verificationData.get("code")).toBe("123456");
    expect(mocks.replace).toHaveBeenCalledWith("/app/imports");
  });

  it("keeps the verification form open for invalid or expired codes", async () => {
    mocks.signIn
      .mockResolvedValueOnce({ signingIn: false })
      .mockRejectedValueOnce(new Error("Invalid code"));
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" />);

    await user.type(screen.getByLabelText("Name"), "Cook");
    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    const codeInput = screen.getByLabelText("Verification code");
    await user.type(codeInput, "654321");
    fireEvent.submit(codeInput.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or expired/i);
    expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
