"use client";

import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type Ref,
} from "react";
import { Input } from "@/components/ui/input";
import { isRecipeLink } from "@/convex/lib/plannerRules";
import { cn } from "@/lib/utils";
import type { PickerData, PickerOption } from "./picker-options";

const EMPTY_PICKER: PickerData = { recipes: [], meals: [] };
const PickerContext = createContext<PickerData>(EMPTY_PICKER);

/** The Recipe Book and planner meal names every slot's picker offers. */
export const PlannerPickerProvider = PickerContext.Provider;
export const usePlannerPicker = () => useContext(PickerContext);

/** A commit's outcome: the name the server stored (when it says), or null if it failed. */
export type Committed = { name?: string } | null;

export type SlotInputHandle = {
  /**
   * Hands over an uncommitted draft (not a link, which commits as usual) and
   * marks it committed; `restore` undoes that if the change carrying it fails.
   */
  takeDraft: () => { text: string; restore: () => void } | undefined;
  /** Commits an uncommitted draft, after a held blur. */
  flush: () => void;
  /** Focuses the input and opens its list to browse every choice. */
  openPicker: () => void;
};

/** A list row is 44px tall; keep at least three in view, at most six. */
const ROW = 44;
const MIN_LIST = ROW * 3;
const MAX_LIST = ROW * 6;

/**
 * Sizes the open list to the room between the input and whatever hides the
 * bottom of the screen: the on-screen keyboard (the visual viewport) or the
 * phone's bottom navigation. With less than three rows of room, scrolls the
 * input up once so the list opens below it rather than over it.
 */
function fitList(input: HTMLInputElement, list: HTMLElement, scrolled: { current: boolean }) {
  const viewport = window.visualViewport;
  let bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const nav = document.querySelector(".mobile-nav");
  if (nav) {
    const rect = nav.getBoundingClientRect();
    if (rect.height > 0 && rect.top < bottom) bottom = rect.top;
  }
  const room = bottom - input.getBoundingClientRect().bottom - 12;
  if (room < MIN_LIST && !scrolled.current) {
    scrolled.current = true;
    input.scrollIntoView?.({ block: "start" });
    return fitList(input, list, scrolled);
  }
  list.style.maxHeight = `${Math.round(Math.min(MAX_LIST, Math.max(MIN_LIST, room)))}px`;
}

/**
 * A slot's text input, with the app's own suggestion list (an ARIA 1.2
 * combobox with list autocomplete and manual selection) below it. It keeps
 * its own draft and commits typed text on Enter, change and blur; the last
 * committed text guards against Enter followed by blur committing twice.
 * Arrow keys move through the list, Enter picks the highlighted row (or
 * commits the typed text when none is), Escape closes it.
 */
export function SlotInput({
  handle,
  holdBlur,
  id,
  label,
  initial,
  placeholder,
  onCommit,
  onEnter,
  options,
  onPick,
}: {
  handle?: Ref<SlotInputHandle>;
  /** Whether to hold this blur's commit for a type button press. */
  holdBlur?: (event: FocusEvent<HTMLInputElement>) => boolean;
  id: string;
  label: string;
  initial: string;
  placeholder: string;
  onCommit: (text: string) => Promise<Committed>;
  onEnter: () => void;
  /** The rows to offer for the current text; `browse` when opened to see every choice. */
  options?: (text: string, browse: boolean) => PickerOption[];
  onPick?: (option: PickerOption) => Promise<Committed>;
}) {
  const [draft, setDraftState] = useState(initial);
  // The draft as of the latest change, for handlers that run before a
  // re-render (picking with Enter moves focus on, and that blur commits).
  const latest = useRef(initial);
  const setDraft = (next: string | ((current: string) => string)) => {
    const value = typeof next === "function" ? next(latest.current) : next;
    latest.current = value;
    setDraftState(value);
  };
  const committed = useRef(initial);
  // When the saved name changes (a commit landed, or the slot was cleared),
  // show it. The input stays mounted so it keeps focus.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setDraftState(initial);
  }
  useEffect(() => {
    committed.current = initial;
    latest.current = initial;
  }, [initial]);

  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [active, setActive] = useState(-1);
  const rows = open && options ? options(draft, browse) : [];
  const expanded = rows.length > 0;
  const highlighted = active >= 0 && active < rows.length ? active : -1;
  const listId = `${id}-options`;
  const optionId = (index: number) => `${listId}-${index}`;

  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const scrolled = useRef(false);

  useLayoutEffect(() => {
    if (!expanded || !input.current || !list.current) {
      scrolled.current = false;
      return;
    }
    const field = input.current;
    const popup = list.current;
    const fit = () => fitList(field, popup, scrolled);
    fit();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
    };
  }, [expanded]);

  useEffect(() => {
    if (highlighted < 0) return;
    document.getElementById(optionId(highlighted))?.scrollIntoView?.({ block: "nearest" });
  });

  function close() {
    setOpen(false);
    setBrowse(false);
    setActive(-1);
  }

  function commit() {
    const sent = latest.current;
    if (sent === committed.current) return;
    const previous = committed.current;
    committed.current = sent;
    void onCommit(sent).then((result) => {
      if (result === null) {
        committed.current = previous;
        return;
      }
      // Retyping a stored name in another case or punctuation keeps the stored
      // name, which may equal what is already shown as saved: show it, unless
      // the user has typed on since.
      const stored = result.name;
      if (stored === undefined || committed.current !== sent) return;
      committed.current = stored;
      setDraft((current) => (current === sent ? stored : current));
    });
  }

  function pick(option: PickerOption) {
    close();
    if (!onPick) return;
    const text = option.kind === "create" ? option.name : option.label;
    const previous = committed.current;
    committed.current = text;
    setDraft(text);
    void onPick(option).then((result) => {
      if (result === null) {
        committed.current = previous;
        return;
      }
      const stored = result.name;
      if (stored === undefined || committed.current !== text) return;
      committed.current = stored;
      setDraft((current) => (current === text ? stored : current));
    });
  }

  useImperativeHandle(handle, () => ({
    takeDraft() {
      const text = latest.current;
      if (text === committed.current) return undefined;
      if (isRecipeLink(text)) {
        commit();
        return undefined;
      }
      const previous = committed.current;
      committed.current = text;
      return { text, restore: () => { committed.current = previous; } };
    },
    flush: commit,
    openPicker() {
      input.current?.focus();
      setOpen(true);
      setBrowse(true);
      setActive(-1);
    },
  }));

  return (
    <div className="planner-combobox">
      <Input
        ref={input}
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete={options ? "list" : "none"}
        aria-expanded={expanded}
        aria-controls={options ? listId : undefined}
        aria-activedescendant={highlighted >= 0 ? optionId(highlighted) : undefined}
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="next"
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setBrowse(false);
          setActive(-1);
        }}
        onBlur={(event) => {
          close();
          if (!holdBlur?.(event)) commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!options) return;
            event.preventDefault();
            if (!expanded) {
              setOpen(true);
              setActive(event.key === "ArrowDown" ? 0 : -1);
              return;
            }
            const last = rows.length - 1;
            if (event.key === "ArrowDown") setActive(highlighted >= last ? 0 : highlighted + 1);
            else setActive(highlighted <= 0 ? last : highlighted - 1);
            return;
          }
          if (event.key === "Escape") {
            if (!expanded) return;
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (highlighted >= 0) pick(rows[highlighted]);
          else {
            close();
            commit();
          }
          onEnter();
        }}
      />
      {options && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={`Choices for ${label}`}
          className="planner-listbox"
          hidden={!expanded}
          // Keep focus in the input so a tap on a row is a pick, not a blur.
          onMouseDown={(event) => event.preventDefault()}
        >
          {rows.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlighted}
              className={cn("planner-option", option.kind === "create" && "planner-option-create")}
              onClick={() => pick(option)}
            >
              <span className="planner-option-label">{option.label}</span>
              {option.detail && <span className="planner-option-detail">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
