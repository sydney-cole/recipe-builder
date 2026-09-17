import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordResetForm } from "./password-reset-form";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mocks.signIn }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a reset code and then accepts a new password", async () => {
    mocks.signIn
      .mockResolvedValueOnce({ signingIn: false })
      .mockResolvedValueOnce({ signingIn: true });
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText("Email"), " Cook@Example.com ");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));

    const requestData = mocks.signIn.mock.calls[0][1] as FormData;
    expect(requestData.get("flow")).toBe("reset");
    expect(requestData.get("email")).toBe("cook@example.com");
    expect(screen.getByText(/six-digit code sent to cook@example.com/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reset code"), "123456");
    await user.type(screen.getByLabelText("New password"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    const verificationData = mocks.signIn.mock.calls[1][1] as FormData;
    expect(verificationData.get("flow")).toBe("reset-verification");
    expect(verificationData.get("email")).toBe("cook@example.com");
    expect(verificationData.get("code")).toBe("123456");
    expect(verificationData.get("newPassword")).toBe("new-password-123");
    expect(mocks.replace).toHaveBeenCalledWith("/app");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows a safe message for an invalid or expired code", async () => {
    mocks.signIn
      .mockResolvedValueOnce({ signingIn: false })
      .mockRejectedValueOnce(new Error("Invalid code"));
    const user = userEvent.setup();
    render(<PasswordResetForm />);

    await user.type(screen.getByLabelText("Email"), "cook@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));
    await user.type(screen.getByLabelText("Reset code"), "111111");
    await user.type(screen.getByLabelText("New password"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Code not accepted");
    expect(screen.getByRole("button", { name: "Reset password" })).toBeEnabled();
  });
});
