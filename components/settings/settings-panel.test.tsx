import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./settings-panel";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: {
      current: "currentUser",
      updateProfile: "updateProfile",
      deleteAccount: "deleteAccount",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({ _id: "user-1", name: "Ada Lovelace", email: "ada@example.com" }),
  useMutation: (reference: string) => reference === "updateProfile"
    ? mocks.updateProfile
    : mocks.deleteAccount,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    mocks.updateProfile.mockReset().mockResolvedValue(null);
    mocks.deleteAccount.mockReset().mockResolvedValue(null);
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
  });

  it("loads the signed-in profile and saves a normalized name", async () => {
    const interaction = userEvent.setup();
    render(<SettingsPanel />);

    expect(screen.getByLabelText("Account email")).toHaveValue("ada@example.com");
    const name = screen.getByLabelText("Name");
    await interaction.clear(name);
    await interaction.type(name, "  Ada Byron  ");
    await interaction.click(screen.getByRole("button", { name: "Save profile" }));

    expect(mocks.updateProfile).toHaveBeenCalledWith({ name: "Ada Byron" });
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });

  it("removes notifications and requires confirmation before deleting the account", async () => {
    const interaction = userEvent.setup();
    render(<SettingsPanel />);

    expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    await interaction.click(screen.getByRole("button", { name: "Delete account" }));

    const confirmButton = screen.getByRole("button", { name: "Permanently delete account" });
    expect(confirmButton).toBeDisabled();
    await interaction.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await interaction.click(confirmButton);

    expect(mocks.deleteAccount).toHaveBeenCalledWith({ confirmation: "DELETE" });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/sign-in");
  });
});
