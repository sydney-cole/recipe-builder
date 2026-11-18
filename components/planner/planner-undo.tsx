"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDay, formatWeekRange } from "@/convex/lib/plannerSlots";
import { cn } from "@/lib/utils";

type LastChange = NonNullable<FunctionReturnType<typeof api.plannerHistory.lastChange>>;

/** How long Undo stays offered, and how long its result message stays. */
export const UNDO_MS = 10_000;
const DONE_MS = 5_000;
/** A change recorded this soon after this tab started one counts as this tab's own. */
const OWN_CHANGE_MS = 15_000;

type PlannerUndo = {
  /** Call as a slot change starts, so its Undo is offered here when it lands. */
  expectChange: () => void;
};

const PlannerUndoContext = createContext<PlannerUndo>({ expectChange: () => {} });

export function usePlannerUndo() {
  return useContext(PlannerUndoContext);
}

export function changeMessage(last: LastChange) {
  const { change } = last;
  if (change.kind === "copy") return `Copied ${formatWeekRange(change.fromStart)} into ${formatWeekRange(change.toStart)}.`;
  const slot = `${formatDay(change.date).long} ${change.meal}`;
  if (last.createdRecipeName !== undefined) return `Created “${last.createdRecipeName}” for ${slot}.`;
  return `Changed ${slot}.`;
}

type Toast =
  | { kind: "offer"; last: LastChange }
  | { kind: "busy"; last: LastChange }
  | { kind: "done"; message: string };

/**
 * Offers to undo the planner's last slot change for a few seconds after this
 * tab makes it. The server recorded what the change replaced; Undo puts it
 * back. The offer never takes focus, so typing on to the next slot goes on.
 */
export function PlannerUndoProvider({ plannerId, children }: { plannerId: Id<"planners"> | undefined; children: ReactNode }) {
  const last = useQuery(api.plannerHistory.lastChange, plannerId ? { plannerId } : "skip");
  const restore = useMutation(api.plannerHistory.restore);
  const [toast, setToast] = useState<Toast | null>(null);
  const [paused, setPaused] = useState(false);
  // True for a while after this tab starts a slot change: a change recorded
  // meanwhile is this tab's own, so its Undo is offered here.
  const [expecting, setExpecting] = useState(false);
  const expectTimer = useRef<number | undefined>(undefined);
  // The change last seen; the one known when the page loaded is never offered.
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);
  const undoButton = useRef<HTMLButtonElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);

  const expectChange = useCallback(() => {
    setExpecting(true);
    window.clearTimeout(expectTimer.current);
    expectTimer.current = window.setTimeout(() => setExpecting(false), OWN_CHANGE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(expectTimer.current), []);

  // A new last change: offer it if it is this tab's; once it is undone, drop its offer.
  const lastId = last === undefined ? undefined : (last?.changeId ?? null);
  if (lastId !== undefined && lastId !== seenId) {
    setSeenId(lastId);
    if (seenId !== undefined) {
      if (last) {
        if (expecting) setToast({ kind: "offer", last });
      } else if (toast?.kind === "offer") {
        setToast(null);
      }
    }
  }

  useEffect(() => {
    if (toast === null || toast.kind === "busy" || paused) return;
    const timer = window.setTimeout(() => setToast(null), toast.kind === "offer" ? UNDO_MS : DONE_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused]);

  async function undo(change: LastChange) {
    if (plannerId === undefined) return;
    const hadFocus = document.activeElement === undoButton.current;
    setToast({ kind: "busy", last: change });
    let message: string;
    try {
      const { keptRecipeName } = await restore({ plannerId, changeId: change.changeId });
      message = keptRecipeName === null ? "Undone." : `Undone. “${keptRecipeName}” is still in your Recipe Book.`;
    } catch {
      message = "Couldn’t undo that change.";
    }
    setToast({ kind: "done", message });
    // The Undo button is gone; keep a keyboard user in the message rather than at the top of the page.
    if (hadFocus) requestAnimationFrame(() => dismissButton.current?.focus());
  }

  if (toast === null && paused) setPaused(false);

  const value = useMemo(() => ({ expectChange }), [expectChange]);
  const message = toast === null ? "" : toast.kind === "done" ? toast.message : changeMessage(toast.last);

  return (
    <PlannerUndoContext.Provider value={value}>
      {children}
      {plannerId !== undefined && (
        <div className="planner-undo-region">
          <div
            className={cn("planner-undo", toast !== null && "open")}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {/* Always rendered, so screen readers announce each new message. */}
            <span className="planner-undo-message" role="status">{message}</span>
            {toast !== null && toast.kind !== "done" && (
              <button
                ref={undoButton}
                type="button"
                className="planner-undo-action"
                disabled={toast.kind === "busy"}
                onClick={() => void undo(toast.last)}
              >
                {toast.kind === "busy" ? "Undoing…" : "Undo"}
              </button>
            )}
            {toast !== null && (
              <button ref={dismissButton} type="button" className="planner-undo-dismiss" aria-label="Dismiss" onClick={() => setToast(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </PlannerUndoContext.Provider>
  );
}
