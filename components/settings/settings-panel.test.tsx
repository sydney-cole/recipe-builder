import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./settings-panel";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  provisionInbox: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: {
      current: "currentUser",
      updateProfile: "updateProfile",
      updateNotificationPreferences: "updateNotificationPreferences",
    },
    email: { currentInbox: "currentInbox", provisionInbox: "provisionInbox" },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: string) => reference === "currentUser"
    ? { _id: "user-1", name: "Ada Lovelace", email: "ada@example.com" }
    : { _id: "inbox-1", email: "recipes@example.com" },
  useMutation: (reference: string) => reference === "updateProfile"
    ? mocks.updateProfile
    : mocks.updatePreferences,
  useAction: () => mocks.provisionInbox,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    mocks.updateProfile.mockReset().mockResolvedValue(null);
    mocks.updatePreferences.mockReset().mockResolvedValue(null);
    mocks.provisionInbox.mockReset().mockResolvedValue({ email: "recipes@example.com" });
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

  it("persists notification choices", async () => {
    const interaction = userEvent.setup();
    render(<SettingsPanel />);

    await interaction.click(screen.getByRole("checkbox", { name: "A recipe import is ready" }));

    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      preferences: {
        recipeImportReady: false,
        importNeedsReview: true,
        subscriptionNeedsAttention: true,
      },
    });
    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
  });

  it("shows the connected recipe inbox", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("recipes@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });
});
