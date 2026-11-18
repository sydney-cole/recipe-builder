import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeekGroceryList } from "./week-grocery-list";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => (args === "skip" ? undefined : mocks.queries[getFunctionName(ref)]),
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue({ listId: "list-1", created: true, notIncluded: [] });
    return mocks.mutations[name];
  },
}));

const props = { plannerId: "planner-1" as never, start: "2026-11-16" };

describe("WeekGroceryList", () => {
  beforeEach(() => {
    mocks.queries = {};
    mocks.mutations = {};
  });

  it("offers to create the week's list when it has none", async () => {
    const user = userEvent.setup();
    mocks.queries["plannerGrocery:forWeek"] = { list: null };
    render(<WeekGroceryList {...props} />);
    expect(screen.getByRole("heading", { name: "Grocery list" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create grocery list" }));
    await waitFor(() =>
      expect(mocks.mutations["plannerGrocery:syncWeek"]).toHaveBeenCalledWith({ plannerId: "planner-1", start: "2026-11-16" }),
    );
  });

  it("links to an existing list, offers an update and says when the plan changed", async () => {
    const user = userEvent.setup();
    mocks.queries["plannerGrocery:forWeek"] = {
      list: {
        listId: "list-1",
        name: "Week of Nov 16",
        syncedAt: new Date(2026, 10, 16, 9, 30).getTime(),
        changed: true,
        notIncluded: [
          { date: "2026-11-17", meal: "dinner", name: "Tacos", reason: "no-ingredients" },
          { date: "2026-11-19", meal: "lunch", name: "", reason: "no-recipe" },
        ],
      },
    };
    render(<WeekGroceryList {...props} />);
    expect(screen.getByRole("link", { name: "Open Week of Nov 16" })).toHaveAttribute("href", "/app/grocery-lists/list-1");
    expect(screen.getByText(/Last updated from the plan/)).toBeInTheDocument();
    expect(screen.getByText("The plan has changed since.")).toBeInTheDocument();
    expect(screen.getByText(/Tacos/)).toHaveTextContent("Tacos (Tue dinner): the recipe has no ingredients");
    expect(screen.getByText(/Thu lunch/)).toHaveTextContent("Unnamed meal (Thu lunch): no recipe is linked");

    await user.click(screen.getByRole("button", { name: "Update from plan" }));
    expect(mocks.mutations["plannerGrocery:syncWeek"]).toHaveBeenCalledTimes(1);
  });

  it("does not show the changed hint when the list is up to date", () => {
    mocks.queries["plannerGrocery:forWeek"] = {
      list: { listId: "list-1", name: "Week of Nov 16", syncedAt: 1, changed: false, notIncluded: [] },
    };
    render(<WeekGroceryList {...props} />);
    expect(screen.queryByText("The plan has changed since.")).toBeNull();
  });

  it("reports a failed update", async () => {
    const user = userEvent.setup();
    mocks.queries["plannerGrocery:forWeek"] = { list: null };
    mocks.mutations["plannerGrocery:syncWeek"] = vi.fn().mockRejectedValue(new Error("boom"));
    render(<WeekGroceryList {...props} />);
    await user.click(screen.getByRole("button", { name: "Create grocery list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t update the grocery list. Try again.");
  });
});
