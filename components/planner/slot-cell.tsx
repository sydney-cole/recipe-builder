"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { ImportResultDialog } from "@/components/discovery/import-result-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isRecipeLink, MEAL_LABELS, MEALS, type Meal, type SlotType } from "@/convex/lib/plannerRules";
import {
  formatDay,
  leftoverChoices,
  leftoverLabel,
  nextSlot,
  resolveLeftover,
  type SlotRef,
} from "@/convex/lib/plannerSlots";
import { announceRecipeImport } from "@/lib/recipe-import-events";
import { cn } from "@/lib/utils";
import { mainOptions, mealOptions, type PickerOption } from "./picker-options";
import { usePlannerUndo } from "./planner-undo";
import { SlotInput, usePlannerPicker, type Committed, type SlotInputHandle } from "./slot-combobox";
import { SlotImportDialog } from "./slot-import-dialog";
import { SLOT_TYPES, type SlotView } from "./types";

/** The id of a slot's main control: its input, its leftovers select or its Skip button. */
export const slotControlId = (date: string, meal: Meal) => `planner-slot-${date}-${meal}`;
/** The id of a slot's other-leftovers input. */
export const otherInputId = (date: string, meal: Meal) => `planner-other-${date}-${meal}`;

const sourceKey = (ref: SlotRef) => `${ref.date}|${ref.meal}`;

const PLACEHOLDERS = { cook: "What are you cooking?", out: "Where or what?" } as const;

export type SlotCellProps = {
  plannerId: Id<"planners">;
  date: string;
  meal: Meal;
  weekStart: string;
  /** Every slot the week query returned, which leftover choices need. */
  slots: SlotView[];
  requestFocus: (id: string) => void;
  /** The meals the planner shows, which Enter moves through. */
  meals?: readonly Meal[];
};

export function SlotCell({ plannerId, date, meal, weekStart, slots, requestFocus, meals = MEALS }: SlotCellProps) {
  const setType = useMutation(api.planner.setType);
  const commitText = useMutation(api.planner.commitText);
  const commitOther = useMutation(api.planner.commitOther);
  const setLeftoverOf = useMutation(api.planner.setLeftoverOf);
  const importLink = useMutation(api.planner.importLink);
  const attachRecipe = useMutation(api.planner.attachRecipe);
  const createRecipeForSlot = useMutation(api.planner.createRecipeForSlot);
  const picker = usePlannerPicker();
  const undo = usePlannerUndo();
  const [importOpen, setImportOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultImportId, setResultImportId] = useState<Id<"recipeImports"> | null>(null);

  const slot = slots.find((candidate) => candidate.date === date && candidate.meal === meal);
  const type = slot?.type ?? null;
  const ref = { date, meal };
  const label = `${formatDay(date).long} ${meal}`;
  const controlId = slotControlId(date, meal);

  // Changes to one slot run one after another, so a press made while a save
  // is in flight waits for it rather than being dropped or racing it.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Queues one change, tracking Saving… and the failure alert. Resolves to whether it saved. */
  function run(change: () => Promise<unknown>) {
    undo.expectChange();
    setPending((count) => count + 1);
    const attempt = queue.current.then(async () => {
      setFailed(false);
      try {
        await change();
        return true;
      } catch {
        setFailed(true);
        return false;
      } finally {
        setPending((count) => count - 1);
      }
    });
    queue.current = attempt;
    return attempt;
  }

  /** Enter: the day's next shown meal, then the next day's first; stays put on the week's last (§2.3). */
  function focusNext() {
    const next = nextSlot(ref, weekStart, meals);
    if (next) requestFocus(slotControlId(next.date, next.meal));
  }

  // After a type change, focus moves to the slot's main control (§2.3). That
  // control often exists only once the change lands, so wait until the slot
  // shows the expected state, then focus whatever control it now has.
  const section = useRef<HTMLElement>(null);
  const focusWhen = useRef<((current: SlotView | undefined) => boolean) | null>(null);
  useEffect(() => {
    const landed = focusWhen.current;
    if (landed === null || !landed(slot)) return;
    focusWhen.current = null;
    const active = document.activeElement;
    // Leave focus alone if the user has moved on to another part of the page.
    if (active !== null && active !== document.body && !section.current?.contains(active)) return;
    const showsOther = slot?.type === "left" && resolveLeftover(slots, slot)?.kind !== "source";
    document.getElementById(showsOther ? otherInputId(date, meal) : controlId)?.focus();
  });

  // Typing then pressing a type button: the input's blur would commit the
  // text as its own change (a "Chipotle" recipe before Eat out). Instead the
  // blur is held while a type button is being pressed, and the press sends the
  // draft with the type as one change. If no press follows, the draft commits.
  const mainInput = useRef<SlotInputHandle>(null);
  const typeGroup = useRef<HTMLDivElement>(null);
  const pressing = useRef(false);
  const abandon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(abandon.current), []);

  function holdBlur(event: FocusEvent<HTMLInputElement>) {
    const to = event.relatedTarget;
    return pressing.current || (to instanceof Node && typeGroup.current?.contains(to) === true);
  }

  function startPress() {
    pressing.current = true;
    clearTimeout(abandon.current);
    // A click follows pointerup straight away; if none comes, the press was abandoned.
    const settle = () => {
      window.removeEventListener("pointerup", settle);
      window.removeEventListener("pointercancel", settle);
      clearTimeout(abandon.current);
      abandon.current = setTimeout(() => {
        if (!pressing.current) return;
        pressing.current = false;
        if (!typeGroup.current?.contains(document.activeElement)) mainInput.current?.flush();
      }, 300);
    };
    window.addEventListener("pointerup", settle);
    window.addEventListener("pointercancel", settle);
  }

  function pressType(pressed: SlotType) {
    pressing.current = false;
    clearTimeout(abandon.current);
    const draft = mainInput.current?.takeDraft();
    const clearing = type === pressed;
    focusWhen.current = (current) => (clearing ? current === undefined : current?.type === pressed);
    const text = draft === undefined ? {} : { text: draft.text };
    void run(() => setType({ plannerId, date, meal, type: pressed, ...text })).then((saved) => {
      if (saved) return;
      focusWhen.current = null;
      draft?.restore();
    });
  }

  function showImport(importId: Id<"recipeImports">) {
    setResultImportId(importId);
    setResultOpen(true);
  }

  async function commitMain(text: string): Promise<Committed> {
    if (isRecipeLink(text)) {
      // The app's import flow: a preview the user reviews and saves (owner decision 15).
      const saved = await run(async () => {
        const importId = await importLink({ plannerId, date, meal, url: text.trim() });
        announceRecipeImport(importId);
        showImport(importId);
      });
      return saved ? {} : null;
    }
    return runNamed(async () => (await commitText({ plannerId, date, meal, text })).name);
  }

  /** A row picked from the main input's list. */
  function pickMain(option: PickerOption): Promise<Committed> {
    if (option.kind === "recipe") {
      return runNamed(async () => (await attachRecipe({ plannerId, date, meal, recipeId: option.recipeId })).name);
    }
    if (option.kind === "create") {
      return runNamed(async () => (await createRecipeForSlot({ plannerId, date, meal, name: option.name })).name);
    }
    return commitMain(option.label);
  }

  /** Runs a text commit; resolves to the name the server stored, `{}` if unknown, or null if it failed. */
  async function runNamed(change: () => Promise<string>): Promise<Committed> {
    let name: string | undefined;
    const saved = await run(async () => {
      name = await change();
    });
    return saved ? { name } : null;
  }

  return (
    <section ref={section} className={cn("planner-slot", type && `planner-slot-${type}`)} aria-label={label} aria-busy={pending > 0}>
      <p className="planner-slot-label" aria-hidden="true">{MEAL_LABELS[meal]}</p>
      <div
        ref={typeGroup}
        className="planner-types"
        role="group"
        aria-label={`${label} type`}
        onBlur={(event) => {
          // Focus moved on from the type buttons without a press: commit any held draft.
          const to = event.relatedTarget;
          if (to instanceof Node && typeGroup.current?.contains(to)) return;
          if (!pressing.current) mainInput.current?.flush();
        }}
      >
        {SLOT_TYPES.map((option) => (
          <button
            key={option.type}
            type="button"
            id={option.type === "skip" && type === "skip" ? controlId : undefined}
            className={`planner-type planner-type-${option.type}`}
            aria-pressed={type === option.type}
            onPointerDown={startPress}
            onClick={() => pressType(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {type === "skip" ? (
        <p className="planner-skip-text">Skipping {meal}</p>
      ) : type === "left" && slot ? (
        <LeftoversBody
          slot={slot}
          slots={slots}
          label={label}
          controlId={controlId}
          onChoose={(from) => {
            if (from === "other") focusWhen.current = (current) => current?.type === "left" && current.from === "other";
            void run(() => setLeftoverOf({ plannerId, date, meal, from })).then((saved) => {
              if (!saved) focusWhen.current = null;
            });
          }}
          onCommitOther={(text) => runNamed(async () => (await commitOther({ plannerId, date, meal, text })).name)}
          onEnter={focusNext}
          meals={picker.meals}
        />
      ) : (
        <SlotInput
          handle={mainInput}
          holdBlur={holdBlur}
          id={controlId}
          label={label}
          initial={slot?.name ?? ""}
          placeholder={type === "cook" || type === "out" ? PLACEHOLDERS[type] : `Plan ${meal}`}
          onCommit={commitMain}
          onEnter={focusNext}
          options={(text, browse) => mainOptions(picker, text, type, browse)}
          onPick={pickMain}
        />
      )}

      <SlotMeta
        slot={slot}
        pending={pending > 0}
        onShowImport={showImport}
        onChooseRecipe={() => mainInput.current?.openPicker()}
        onImportLink={() => setImportOpen(true)}
      />
      {failed && (
        <p className="planner-meta planner-error" role="alert">
          Couldn’t save this meal. Try again.
        </p>
      )}
      {slot?.type === "cook" && (
        <SlotImportDialog
          plannerId={plannerId}
          date={date}
          meal={meal}
          name={slot.name || label}
          open={importOpen}
          onOpenChange={setImportOpen}
          onStarted={showImport}
        />
      )}
      {resultImportId !== null && (
        <ImportResultDialog importId={resultImportId} open={resultOpen} onOpenChange={setResultOpen} />
      )}
    </section>
  );
}

function LeftoversBody({
  slot,
  slots,
  label,
  controlId,
  onChoose,
  onCommitOther,
  onEnter,
  meals,
}: {
  slot: SlotView;
  slots: SlotView[];
  label: string;
  controlId: string;
  onChoose: (from: SlotRef | "other") => void;
  onCommitOther: (text: string) => Promise<Committed>;
  onEnter: () => void;
  meals: readonly string[];
}) {
  const choices = leftoverChoices(slots, slot);
  const resolved = resolveLeftover(slots, slot);
  const selected = resolved?.kind === "source" ? sourceKey(resolved.source) : "other";
  return (
    <>
      <select
        id={controlId}
        className="input"
        aria-label={`${label} is leftovers of`}
        value={selected}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "other") return onChoose("other");
          const choice = choices.find((candidate) => sourceKey(candidate) === value);
          if (choice) onChoose(choice);
        }}
      >
        {choices.map((choice) => {
          const source = slots.find((candidate) => candidate.date === choice.date && candidate.meal === choice.meal)!;
          return <option key={sourceKey(choice)} value={sourceKey(choice)}>{leftoverLabel(source)}</option>;
        })}
        <option value="other">Other leftovers</option>
      </select>
      {selected === "other" && (
        <SlotInput
          id={otherInputId(slot.date, slot.meal)}
          label={`${label} leftovers`}
          initial={slot.name}
          placeholder="What are the leftovers?"
          onCommit={onCommitOther}
          onEnter={onEnter}
          options={(text) => mealOptions(meals, text)}
          onPick={(option) => onCommitOther(option.label)}
        />
      )}
    </>
  );
}

function SlotMeta({
  slot,
  pending,
  onShowImport,
  onChooseRecipe,
  onImportLink,
}: {
  slot: SlotView | undefined;
  pending: boolean;
  onShowImport: (importId: Id<"recipeImports">) => void;
  onChooseRecipe: () => void;
  onImportLink: () => void;
}) {
  const recipe = slot?.type === "cook" ? slot.recipe : undefined;
  if (pending) return <p className="planner-meta">Saving…</p>;
  if (slot?.import) {
    const pendingImport = slot.import;
    if (pendingImport.status === "failed") {
      return (
        <p className="planner-meta">
          <span className="planner-warn">The recipe couldn’t be imported.</span>
          <button type="button" className="planner-link-button" onClick={() => onShowImport(pendingImport.importId)}>See why</button>
        </p>
      );
    }
    if (pendingImport.recipeId) {
      return <p className="planner-meta"><Link href={`/app/recipes/${pendingImport.recipeId}`}>Review and save the recipe</Link></p>;
    }
    return <p className="planner-meta">Reading the recipe…</p>;
  }
  if (!slot || slot.type !== "cook") return null;
  if (!recipe) {
    if (!slot.name) return null;
    // A typed name only: grocery lists and nutrition count only slots with a recipe.
    return (
      <p className="planner-meta">
        <span className="planner-quiet">No recipe attached</span>
        <button type="button" className="planner-link-button" onClick={onChooseRecipe}>Choose recipe</button>
        <button type="button" className="planner-link-button" onClick={onImportLink}>Import from link</button>
      </p>
    );
  }
  if (!recipe.available) {
    const removed = recipe.title === "" ? "This recipe" : recipe.title;
    return (
      <p className="planner-meta">
        <span className="planner-warn">{removed} was removed from your Recipe Book</span>
        <button type="button" className="planner-link-button" onClick={onChooseRecipe}>Choose recipe</button>
      </p>
    );
  }
  const count = recipe.ingredientCount;
  return (
    <p className="planner-meta">
      <Link href={`/app/recipe-book/${recipe.recipeId}`} aria-label={`Open the ${slot.name} recipe`}>Recipe</Link>
      {count === 0
        ? <span className="planner-warn">No ingredients yet</span>
        : <span>{count}{recipe.moreIngredients ? "+" : ""} {count === 1 && !recipe.moreIngredients ? "ingredient" : "ingredients"}</span>}
      <button type="button" className="planner-link-button" aria-label={`Change the recipe for ${slot.name}`} onClick={onChooseRecipe}>Change</button>
    </p>
  );
}
