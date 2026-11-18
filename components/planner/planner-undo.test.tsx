import { act, fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { PlannerUndoProvider, UNDO_MS, usePlannerUndo } from "./planner-undo";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: Ref, args: unknown) => (args === "skip" ? undefined : mocks.queries[getFunctionName(ref)]),
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue({ keptRecipeName: null });
    return mocks.mutations[name];
  },
}));

const plannerId = "planner-1" as Id<"planners">;
const change = (changeId: string, extra: object = {}) => ({
  changeId,
  change: { kind: "slot", date: "2026-11-16", meal: "lunch" },
  ...extra,
});

/** A slot input that, like a slot cell, says a change is starting as it commits. */
function Slot() {
  const { expectChange } = usePlannerUndo();
  return <input aria-label="Monday lunch" onKeyDown={(event) => event.key === "Enter" && expectChange()} />;
}

function renderPlanner() {
  const view = render(
    <PlannerUndoProvider plannerId={plannerId}>
      <Slot />
    </PlannerUndoProvider>,
  );
  /** The server's last change moves on, as the query would report it. */
  const lands = (last: unknown) => {
    mocks.queries["plannerHistory:lastChange"] = last;
    view.rerender(
      <PlannerUndoProvider plannerId={plannerId}>
        <Slot />
      </PlannerUndoProvider>,
    );
  };
  return { ...view, lands };
}

const commit = () => fireEvent.keyDown(screen.getByRole("textbox", { name: "Monday lunch" }), { key: "Enter" });

describe("PlannerUndoProvider", () => {
  beforeEach(() => {
    mocks.queries = { "plannerHistory:lastChange": change("old") };
    mocks.mutations = {};
  });
  afterEach(() => vi.useRealTimers());

  it("offers Undo for this tab's change without taking focus, and puts it back", async () => {
    const { lands } = renderPlanner();
    expect(screen.getByRole("status")).toHaveTextContent("");
    const input = screen.getByRole("textbox", { name: "Monday lunch" });
    input.focus();
    commit();
    lands(change("new"));

    expect(screen.getByRole("status")).toHaveTextContent("Changed Monday lunch.");
    expect(input).toHaveFocus();
    await act(async () => screen.getByRole("button", { name: "Undo" }).click());
    expect(mocks.mutations["plannerHistory:restore"]).toHaveBeenCalledWith({ plannerId, changeId: "new" });
    expect(screen.getByRole("status")).toHaveTextContent("Undone.");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("says a recipe the change created stays in the Recipe Book", async () => {
    mocks.mutations["plannerHistory:restore"] = vi.fn().mockResolvedValue({ keptRecipeName: "Pork bao" });
    const { lands } = renderPlanner();
    commit();
    lands(change("new", { createdRecipeName: "Pork bao" }));
    expect(screen.getByRole("status")).toHaveTextContent("Created “Pork bao” for Monday lunch.");
    await act(async () => screen.getByRole("button", { name: "Undo" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Undone. “Pork bao” is still in your Recipe Book.");
  });

  it("describes a week copy", () => {
    const { lands } = renderPlanner();
    commit();
    lands({ changeId: "copy", change: { kind: "copy", fromStart: "2026-11-09", toStart: "2026-11-16" } });
    expect(screen.getByRole("status")).toHaveTextContent("Copied Nov 9 – 15 into Nov 16 – 22.");
  });

  it("goes away after a few seconds, and the next change replaces it", () => {
    vi.useFakeTimers();
    const { lands } = renderPlanner();
    commit();
    lands(change("first"));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
    commit();
    lands(change("second", { change: { kind: "slot", date: "2026-11-17", meal: "dinner" } }));
    expect(screen.getByRole("status")).toHaveTextContent("Changed Tuesday dinner.");
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);

    act(() => vi.advanceTimersByTime(UNDO_MS + 10));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("offers nothing for a change known when the page loaded or made elsewhere, and drops an offer once undone", () => {
    const { lands } = renderPlanner();
    lands(change("elsewhere"));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    commit();
    lands(change("mine"));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    lands(null);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("reports a failed undo", async () => {
    mocks.mutations["plannerHistory:restore"] = vi.fn().mockRejectedValue(new Error("gone"));
    const { lands } = renderPlanner();
    commit();
    lands(change("new"));
    await act(async () => screen.getByRole("button", { name: "Undo" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t undo that change.");
  });
});
