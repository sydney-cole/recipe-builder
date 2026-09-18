import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./settings-panel";

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: {
      current: "currentUser",
      updateProfile: "updateProfile",
      updateNotificationPreferences: "updateNotificationPreferences",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({ _id: "user-1", name: "Ada Lovelace", email: "ada@example.com" }),
  useMutation: (reference: string) => reference === "updateProfile"
    ? mocks.updateProfile
    : mocks.updatePreferences,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    mocks.updateProfile.mockReset().mockResolvedValue(null);
    mocks.updatePreferences.mockReset().mockResolvedValue(null);
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
});
