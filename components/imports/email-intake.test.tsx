import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailIntake } from "./email-intake";

const mocks = vi.hoisted(() => ({
  queryCall: 0,
  mutationCall: 0,
  inbox: {
    email: "recipes@agentmail.example",
    isConfigured: true,
    isEligible: true,
    accountEmail: "cook@example.com",
  } as unknown,
  imports: [] as unknown[],
  queueUrl: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => {
    const value = mocks.queryCall % 2 === 0 ? mocks.inbox : mocks.imports;
    mocks.queryCall += 1;
    return value;
  },
  useMutation: () => {
    const value = mocks.mutationCall % 2 === 0 ? mocks.queueUrl : mocks.retry;
    mocks.mutationCall += 1;
    return value;
  },
}));

describe("EmailIntake", () => {
  beforeEach(() => {
    mocks.queryCall = 0;
    mocks.mutationCall = 0;
    mocks.queueUrl.mockReset().mockResolvedValue("import-1");
    mocks.retry.mockReset().mockResolvedValue("import-1");
    mocks.inbox = {
      email: "recipes@agentmail.example",
      isConfigured: true,
      isEligible: true,
      accountEmail: "cook@example.com",
    };
    mocks.imports = [];
  });

  it("makes URL paste primary and presents one shared inbox without connection controls", async () => {
    const user = userEvent.setup();
    render(<EmailIntake />);
    expect(screen.getByRole("heading", { name: /paste a recipe link/i })).toBeVisible();
    expect(screen.getByText("recipes@agentmail.example")).toBeVisible();
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Recipe URL"), "https://example.com/soup");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));
    expect(mocks.queueUrl).toHaveBeenCalledWith({ sourceUrl: "https://example.com/soup" });
    expect(await screen.findByRole("status")).toHaveTextContent(/progress will update/i);
  });

  it("explains email eligibility without blocking direct URL intake", () => {
    mocks.inbox = {
      email: "recipes@agentmail.example",
      isConfigured: true,
      isEligible: false,
      accountEmail: "cook@example.com",
    };
    render(<EmailIntake />);
    expect(screen.getByText(/verify cook@example.com/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Import recipe" })).toBeEnabled();
  });

  it("shows processing, review, saved, and retry actions", async () => {
    mocks.imports = [
      { _id: "queued", sourceUrl: "https://example.com/a", status: "queued", attemptCount: 0 },
      { _id: "retrieving", sourceUrl: "https://example.com/b", status: "scraping", processingStage: "retrieving", attemptCount: 1 },
      { _id: "generating", sourceUrl: "https://example.com/c", status: "scraping", processingStage: "generating", attemptCount: 1 },
      { _id: "parsed", sourceUrl: "https://example.com/d", status: "parsed", attemptCount: 1 },
      { _id: "completed", sourceUrl: "https://example.com/e", status: "completed", recipeId: "recipe-1", attemptCount: 1 },
      { _id: "failed", sourceUrl: "https://example.com/f", status: "failed", errorMessage: "Temporary failure", errorRetryable: true, attemptCount: 1 },
    ];
    const user = userEvent.setup();
    render(<EmailIntake />);
    expect(screen.getByText("Retrieving")).toBeVisible();
    expect(screen.getByText("Generating")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review draft" })).toHaveAttribute("href", "/app/imports/parsed/review");
    expect(screen.getByRole("link", { name: "View recipe" })).toHaveAttribute("href", "/app/recipe-book/recipe-1");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledWith({ importId: "failed" });
  });
});
