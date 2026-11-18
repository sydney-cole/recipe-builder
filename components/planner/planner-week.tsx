"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  addDays,
  formatWeekRange,
  isDateKey,
  weekDates,
  weekStartOf,
  weekSummary,
  type WeekStart,
} from "@/convex/lib/plannerSlots";
import { CopyWeekButton } from "./copy-week-dialog";
import { DayCard, dayCardId } from "./day-card";
import { PlannerPreferencesDialog } from "./planner-preferences-dialog";
import { PlannerUndoProvider } from "./planner-undo";
import { PlannerPickerProvider } from "./slot-combobox";
import { useToday } from "./use-today";
import { WeekGroceryList } from "./week-grocery-list";
import { WeekStrip } from "./week-strip";

/** What typing does, matching the rules exactly (fixes the prototype's bug 2). */
export const PLANNER_HINT =
  "Type a meal and press Enter to go to the next one. Pick a recipe from the list to attach it, or keep just the name and attach a recipe later. Type just “skip” or “leftovers”, or start with “out” (like “out at Chipotle”), to set the type. Paste a recipe link to import it for review. Press a selected type again to clear it.";

const PREVIOUS_WEEK_ID = "planner-previous-week";
const NO_CHOICES = { recipes: [], meals: [] };

/**
 * Keeps `--planner-toolbar-height` on the planner at the sticky toolbar's
 * real height, which grows when it wraps to two rows on a narrow phone, so a
 * day card scrolled into view lands below it (scroll-margin-top). Attached as
 * a ref, so it is measured before the scroll to today.
 */
function measureToolbar(toolbar: HTMLDivElement | null) {
  const planner = toolbar?.parentElement;
  if (!toolbar || !planner) return;
  const update = () => planner.style.setProperty("--planner-toolbar-height", `${toolbar.getBoundingClientRect().height}px`);
  update();
  if (typeof ResizeObserver !== "function") return;
  const observer = new ResizeObserver(update);
  observer.observe(toolbar);
  return () => observer.disconnect();
}

/** The planner, with Undo for its slot changes around everything that makes them. */
export function PlannerWeek() {
  const planner = useQuery(api.planner.mine, {});
  return (
    <PlannerUndoProvider plannerId={planner?.plannerId}>
      <PlannerWeekView />
    </PlannerUndoProvider>
  );
}

function PlannerWeekView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useToday();
  const planner = useQuery(api.planner.mine, {});
  const ensure = useMutation(api.planner.ensure);
  const ensureStarted = useRef(false);
  const [ensureFailed, setEnsureFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "This week" disappears once used, so focus moves to "Previous week" (§2.2).
  const focusPrevious = useRef(false);

  useEffect(() => {
    if (planner !== null || ensureStarted.current) return;
    ensureStarted.current = true;
    ensure({}).catch(() => setEnsureFailed(true));
  }, [planner, ensure]);

  const weekStartPreference: WeekStart = planner?.weekStart ?? 1;
  const requested = searchParams.get("week");
  const start = weekStartOf(requested !== null && isDateKey(requested) ? requested : today, weekStartPreference);
  const currentStart = weekStartOf(today, weekStartPreference);
  const week = useQuery(api.planner.week, planner ? { plannerId: planner.plannerId, start } : "skip");
  const picker = useQuery(api.planner.pickerOptions, planner ? { plannerId: planner.plannerId } : "skip");

  // A control to focus once it exists: a slot's type can change its main
  // control, which appears only after the week query updates (§2.3).
  const pendingFocus = useRef<string | null>(null);
  const requestFocus = useCallback((id: string) => {
    const element = document.getElementById(id);
    element?.focus();
    // Keep trying on later renders until the control exists and takes focus.
    pendingFocus.current = element !== null && document.activeElement === element ? null : id;
  }, []);
  useEffect(() => {
    // Once the user moves focus themselves, drop a request still waiting.
    const forget = (event: FocusEvent) => {
      if (pendingFocus.current !== null && (event.target as HTMLElement | null)?.id !== pendingFocus.current) {
        pendingFocus.current = null;
      }
    };
    document.addEventListener("focusin", forget);
    return () => document.removeEventListener("focusin", forget);
  }, []);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const element = document.getElementById(pendingFocus.current);
    element?.focus();
    if (element !== null && document.activeElement === element) pendingFocus.current = null;
  });

  // On a phone, open the current week at today's card, once.
  const scrolledToToday = useRef(false);
  const weekLoaded = week !== undefined;
  useEffect(() => {
    if (scrolledToToday.current || !weekLoaded || start !== currentStart) return;
    scrolledToToday.current = true;
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 767px)").matches) return;
    document.getElementById(dayCardId(today))?.scrollIntoView?.({ block: "start" });
  }, [weekLoaded, start, currentStart, today]);

  useEffect(() => {
    if (focusPrevious.current && start === currentStart) {
      focusPrevious.current = false;
      document.getElementById(PREVIOUS_WEEK_ID)?.focus();
    }
  }, [start, currentStart]);

  function showWeek(next: string) {
    router.replace(`?week=${next}`, { scroll: false });
  }

  if (ensureFailed) {
    return <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Your planner could not be set up. Reload the page to try again.</p>;
  }

  return (
    <div className="planner">
      <div ref={measureToolbar} className="planner-toolbar">
        <div className="planner-week-nav">
          <Button id={PREVIOUS_WEEK_ID} variant="secondary" size="icon" aria-label="Previous week" onClick={() => showWeek(addDays(start, -7))}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Button>
          <h2 className="planner-range" aria-live="polite">{formatWeekRange(start)}</h2>
          <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => showWeek(addDays(start, 7))}>
            <ChevronRight size={20} aria-hidden="true" />
          </Button>
          {start !== currentStart && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                focusPrevious.current = true;
                showWeek(currentStart);
              }}
            >
              This week
            </Button>
          )}
        </div>
        <div className="planner-toolbar-actions">
          <CopyWeekButton
            plannerId={planner?.plannerId}
            start={start}
            planned={week ? weekSummary(week.slots, start).planned : 0}
            disabled={!week}
          />
          <Button variant="ghost" size="sm" disabled={!planner} onClick={() => setSettingsOpen(true)}>
            <Settings2 size={17} aria-hidden="true" />
            Planner settings
          </Button>
        </div>
      </div>

      {planner === undefined || planner === null || week === undefined ? (
        <div className="planner-loading">
          <p className="sr-only" role="status">Loading your plan…</p>
          <Skeleton className="h-8 w-full max-w-md" />
          {[0, 1, 2].map((item) => <Skeleton className="h-40" key={item} />)}
        </div>
      ) : (
        <PlannerPickerProvider value={picker ?? NO_CHOICES}>
          <WeekStrip slots={week.slots} start={start} meals={planner.meals} />
          <WeekGroceryList plannerId={planner.plannerId} start={start} />
          <ul className="planner-days" aria-label={`Meals for ${formatWeekRange(start)}`}>
            {weekDates(start).map((date) => (
              <DayCard
                key={date}
                plannerId={planner.plannerId}
                date={date}
                today={date === today}
                weekStart={start}
                slots={week.slots}
                requestFocus={requestFocus}
                meals={planner.meals}
              />
            ))}
          </ul>
          <p className="planner-hint">{PLANNER_HINT}</p>
        </PlannerPickerProvider>
      )}

      {planner && (
        <PlannerPreferencesDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          plannerId={planner.plannerId}
          weekStart={planner.weekStart}
          people={planner.people}
          meals={planner.meals}
          onWeekStartChange={(next) => showWeek(weekStartOf(start, next))}
        />
      )}
    </div>
  );
}
