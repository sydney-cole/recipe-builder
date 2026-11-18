import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerWeek } from "./planner-week";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  search: "",
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => (args === "skip" ? undefined : mocks.queries[getFunctionName(ref)]),
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue(null);
    return mocks.mutations[name];
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

const planner = { plannerId: "planner-1", weekStart: 1, people: 2, meals: ["breakfast", "lunch", "dinner"] };

describe("PlannerWeek", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 18, 9, 0));
    mocks.queries = { "planner:mine": planner, "planner:week": { slots: [] }, "planner:pickerOptions": { recipes: [], meals: [] } };
    mocks.mutations = {};
    mocks.search = "";
    mocks.replace.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("shows a loading status while the plan loads", () => {
    mocks.queries["planner:mine"] = undefined;
    render(<PlannerWeek />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your plan…");
  });

  it("creates the planner once on a first visit", async () => {
    mocks.queries["planner:mine"] = null;
    const { rerender } = render(<PlannerWeek />);
    rerender(<PlannerWeek />);
    await waitFor(() => expect(mocks.mutations["planner:ensure"]).toHaveBeenCalledTimes(1));
  });

  it("shows the week from the URL and moves between weeks", async () => {
    const user = userEvent.setup();
    mocks.search = "week=2026-11-25";
    render(<PlannerWeek />);
    expect(screen.getByRole("heading", { name: "Nov 23 – 29" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(mocks.replace).toHaveBeenCalledWith("?week=2026-11-30", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(mocks.replace).toHaveBeenCalledWith("?week=2026-11-16", { scroll: false });
  });

  it("offers This week only away from the current week and then focuses Previous week", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PlannerWeek />);
    expect(screen.getByRole("heading", { name: "Nov 16 – 22" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();

    mocks.search = "week=2026-12-02";
    rerender(<PlannerWeek />);
    await user.click(screen.getByRole("button", { name: "This week" }));
    expect(mocks.replace).toHaveBeenCalledWith("?week=2026-11-16", { scroll: false });
    mocks.search = "week=2026-11-16";
    rerender(<PlannerWeek />);
    expect(screen.getByRole("button", { name: "Previous week" })).toHaveFocus();
  });

  it("falls back to the current week for an invalid week", () => {
    mocks.search = "week=2026-02-30";
    render(<PlannerWeek />);
    expect(screen.getByRole("heading", { name: "Nov 16 – 22" })).toBeInTheDocument();
  });

  it("changes the week start and moves the shown week back to match", async () => {
    const user = userEvent.setup();
    mocks.search = "week=2026-11-16";
    let resolve: (value: null) => void = () => undefined;
    mocks.mutations["planner:updatePreferences"] = vi.fn(() => new Promise<null>((done) => { resolve = done; }));
    render(<PlannerWeek />);
    await user.click(screen.getByRole("button", { name: "Planner settings" }));
    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    expect(mocks.mutations["planner:updatePreferences"]).toHaveBeenCalledWith({ plannerId: "planner-1", weekStart: 0 });
    expect(screen.getByLabelText("Week starts on")).toHaveValue("0");
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => resolve(null));
    expect(mocks.replace).toHaveBeenCalledWith("?week=2026-11-15", { scroll: false });
  });

  it("leaves the week alone when the week start fails to save", async () => {
    const user = userEvent.setup();
    mocks.search = "week=2026-11-16";
    mocks.mutations["planner:updatePreferences"] = vi.fn().mockRejectedValue(new Error("offline"));
    render(<PlannerWeek />);
    await user.click(screen.getByRole("button", { name: "Planner settings" }));
    await user.selectOptions(screen.getByLabelText("Week starts on"), "0");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t save that setting. Try again.");
    expect(screen.getByLabelText("Week starts on")).toHaveValue("1");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("saves people cooked for, rounded and clamped", async () => {
    const user = userEvent.setup();
    render(<PlannerWeek />);
    await user.click(screen.getByRole("button", { name: "Planner settings" }));
    const people = screen.getByLabelText("People you cook for, yourself included");
    expect(people).toHaveValue(2);
    await user.clear(people);
    await user.type(people, "40");
    await act(async () => people.blur());
    expect(mocks.mutations["planner:updatePreferences"]).toHaveBeenCalledWith({ plannerId: "planner-1", people: 12 });
    expect(people).toHaveValue(12);
  });

  it("saves the meals to plan and keeps at least one on", async () => {
    const user = userEvent.setup();
    mocks.queries["planner:mine"] = { ...planner, meals: ["lunch", "dinner"] };
    render(<PlannerWeek />);
    expect(screen.queryByRole("region", { name: "Monday breakfast" })).toBeNull();
    expect(screen.getByText("0 of 14 planned")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Planner settings" }));
    const meals = screen.getByRole("group", { name: "Meals to plan" });
    expect(screen.getByRole("checkbox", { name: "Breakfast" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Breakfast" }));
    expect(mocks.mutations["planner:updatePreferences"]).toHaveBeenLastCalledWith({ plannerId: "planner-1", meals: ["breakfast", "lunch", "dinner"] });
    await user.click(screen.getByRole("checkbox", { name: "Breakfast" }));
    await user.click(screen.getByRole("checkbox", { name: "Lunch" }));
    expect(mocks.mutations["planner:updatePreferences"]).toHaveBeenLastCalledWith({ plannerId: "planner-1", meals: ["dinner"] });
    expect(screen.getByRole("checkbox", { name: "Dinner" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dinner" })).toBeDisabled();
    expect(meals).toHaveTextContent("Plan at least one meal.");
  });

  it("summarises the week in the strip", () => {
    mocks.queries["planner:week"] = {
      slots: [
        { date: "2026-11-15", meal: "dinner", type: "cook", name: "Before" },
        { date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" },
        { date: "2026-11-17", meal: "dinner", type: "cook", name: "" },
        { date: "2026-11-18", meal: "lunch", type: "skip", name: "" },
      ],
    };
    render(<PlannerWeek />);
    expect(screen.getByText("3 of 21 planned")).toBeInTheDocument();
    expect(screen.getByText("Cook 2")).toBeInTheDocument();
    expect(screen.getByText("Skip 1")).toBeInTheDocument();
    expect(screen.getByText("Leftovers 0")).toBeInTheDocument();
  });

  it("shows seven days from the week start, marks today and scrolls to it on a phone", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<PlannerWeek />);
    const days = screen.getAllByRole("listitem").filter((item) => item.classList.contains("planner-day"));
    expect(days.map((day) => day.querySelector("h3")?.textContent?.slice(0, 3))).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days[2]).toHaveAttribute("aria-current", "date");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(days[2]);
  });

  it("keeps today's scroll offset at the toolbar's real height, even when it wraps", () => {
    let height = 56;
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: this.classList.contains("planner-toolbar") ? height : 0 } as DOMRect;
    });
    const observers: (() => void)[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { observers.push(callback); }
      observe() {}
      disconnect() {}
    });
    const offsetAtScroll: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      offsetAtScroll.push((this.closest(".planner") as HTMLElement).style.getPropertyValue("--planner-toolbar-height"));
    };
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      const { container } = render(<PlannerWeek />);
      const planner = container.querySelector<HTMLElement>(".planner")!;
      expect(offsetAtScroll).toEqual(["56px"]);
      height = 104;
      act(() => observers.forEach((callback) => callback()));
      expect(planner.style.getPropertyValue("--planner-toolbar-height")).toBe("104px");
    } finally {
      rect.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not scroll on another week", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    mocks.search = "week=2026-11-30";
    render(<PlannerWeek />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("offers the Recipe Book in each slot's own list, not a browser datalist", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    mocks.search = "week=2026-11-16";
    mocks.queries["planner:pickerOptions"] = {
      recipes: [{ recipeId: "recipe-1", title: "Chili", source: "Manual" }, { recipeId: "recipe-2", title: "Shrimp", source: "Manual" }],
      meals: ["Thai"],
    };
    const { container } = render(<PlannerWeek />);
    expect(container.querySelector("datalist")).toBeNull();
    await user.type(screen.getByRole("combobox", { name: "Monday lunch" }), "ch");
    const list = screen.getByRole("listbox", { name: "Choices for Monday lunch" });
    expect([...list.querySelectorAll("[role=option]")].map((option) => option.textContent)).toEqual(["ChiliManual", "Create recipe “ch”"]);
  });

  it("offers Undo after typing a meal without interrupting Enter to the next slot", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    mocks.search = "week=2026-11-16";
    mocks.queries["plannerHistory:lastChange"] = null;
    const { rerender } = render(<PlannerWeek />);
    await user.type(screen.getByRole("combobox", { name: "Monday lunch" }), "Chili{Enter}");
    expect(mocks.mutations["planner:commitText"]).toHaveBeenCalledWith({ plannerId: "planner-1", date: "2026-11-16", meal: "lunch", text: "Chili" });
    expect(screen.getByRole("combobox", { name: "Monday dinner" })).toHaveFocus();

    mocks.queries["plannerHistory:lastChange"] = { changeId: "change-1", change: { kind: "slot", date: "2026-11-16", meal: "lunch" } };
    rerender(<PlannerWeek />);
    expect(screen.getByText("Changed Monday lunch.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("combobox", { name: "Monday dinner" })).toHaveFocus();
    await user.type(screen.getByRole("combobox", { name: "Monday dinner" }), "Soup");
    expect(screen.getByRole("combobox", { name: "Monday dinner" })).toHaveValue("Soup");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.mutations["plannerHistory:restore"]).toHaveBeenCalledWith({ plannerId: "planner-1", changeId: "change-1" });
  });

  it("explains exactly what typing does", () => {
    render(<PlannerWeek />);
    expect(
      screen.getByText(
        "Type a meal and press Enter to go to the next one. Pick a recipe from the list to attach it, or keep just the name and attach a recipe later. Type just “skip” or “leftovers”, or start with “out” (like “out at Chipotle”), to set the type. Paste a recipe link to import it for review. Press a selected type again to clear it.",
      ),
    ).toBeInTheDocument();
  });
});
