import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { CopyWeekButton, weekChoiceSummary } from "./copy-week-dialog";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => (args === "skip" ? undefined : mocks.queries[getFunctionName(ref)]),
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue({ written: 3 });
    return mocks.mutations[name];
  },
}));

const plannerId = "planner-1" as Id<"planners">;
const empty = { planned: 0, cook: 0, left: 0, out: 0, skip: 0 };
const weeks = [
  { start: "2026-11-09", planned: 4, cook: 2, left: 1, out: 0, skip: 1 },
  { start: "2026-10-26", planned: 1, cook: 0, left: 0, out: 1, skip: 0 },
];

describe("weekChoiceSummary", () => {
  it("counts the planned meals by type", () => {
    expect(weekChoiceSummary(weeks[0])).toBe("4 meals planned: 2 cook, 1 leftovers, 1 skip");
    expect(weekChoiceSummary(weeks[1])).toBe("1 meal planned: 1 eat out");
    expect(weekChoiceSummary({ start: "2026-11-09", ...empty })).toBe("Nothing planned");
  });
});

describe("CopyWeekButton", () => {
  beforeEach(() => {
    mocks.queries = { "plannerCopy:recentWeeks": weeks };
    mocks.mutations = {};
  });

  it("offers last week first and copies straight into an empty week", async () => {
    const user = userEvent.setup();
    render(<CopyWeekButton plannerId={plannerId} start="2026-11-16" planned={0} />);
    await user.click(screen.getByRole("button", { name: "Copy from…" }));
    const list = within(screen.getByRole("list", { name: "Weeks to copy from" }));
    const options = list.getAllByRole("button");
    expect(options[0]).toHaveTextContent("Last week (Nov 9 – 15)4 meals planned");
    expect(options[1]).toHaveTextContent("Oct 26 – Nov 1");

    await user.click(options[0]);
    expect(mocks.mutations["plannerCopy:copyWeek"]).toHaveBeenCalledWith({ plannerId, fromStart: "2026-11-09", toStart: "2026-11-16", mode: "fill" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks before copying into a planned week", async () => {
    const user = userEvent.setup();
    render(<CopyWeekButton plannerId={plannerId} start="2026-11-16" planned={2} />);
    await user.click(screen.getByRole("button", { name: "Copy from…" }));
    await user.click(screen.getAllByRole("button", { name: /Nov 9 – 15/ })[0]);
    expect(screen.getByText(/already has 2 meals planned/)).toBeInTheDocument();
    expect(mocks.mutations["plannerCopy:copyWeek"]).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Replace everything" }));
    expect(mocks.mutations["plannerCopy:copyWeek"]).toHaveBeenCalledWith(expect.objectContaining({ mode: "replace" }));
  });

  it("disables an empty last week and shows a failure", async () => {
    const user = userEvent.setup();
    mocks.queries["plannerCopy:recentWeeks"] = [{ start: "2026-11-09", ...empty }, weeks[1]];
    mocks.mutations["plannerCopy:copyWeek"] = vi.fn().mockRejectedValue(new Error("nope"));
    render(<CopyWeekButton plannerId={plannerId} start="2026-11-16" planned={1} />);
    await user.click(screen.getByRole("button", { name: "Copy from…" }));
    expect(screen.getByRole("button", { name: /Last week/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Oct 26/ }));
    await user.click(screen.getByRole("button", { name: "Fill empty slots only" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t copy that week");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("is disabled until the planner has loaded", () => {
    render(<CopyWeekButton plannerId={undefined} start="2026-11-16" planned={0} />);
    expect(screen.getByRole("button", { name: "Copy from…" })).toBeDisabled();
  });
});
