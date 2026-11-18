import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { Meal } from "@/convex/lib/plannerRules";
import { DayCard } from "./day-card";
import type { PickerData } from "./picker-options";
import { PlannerPickerProvider } from "./slot-combobox";
import type { SlotView } from "./types";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({ mutations: {} as Record<string, ReturnType<typeof vi.fn>> }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue({ type: "cook", name: "" });
    return mocks.mutations[name];
  },
}));

const plannerId = "planner-1" as Id<"planners">;
const mutation = (name: string) => {
  mocks.mutations[`planner:${name}`] ??= vi.fn().mockResolvedValue({ type: "cook", name: "" });
  return mocks.mutations[`planner:${name}`];
};

const NO_CHOICES: PickerData = { recipes: [], meals: [] };

function renderDays(dates: string[], slots: SlotView[] = [], picker: PickerData = NO_CHOICES, meals?: Meal[]) {
  const requestFocus = (id: string) => document.getElementById(id)?.focus();
  return render(
    <PlannerPickerProvider value={picker}>
      <ul>
        {dates.map((date) => (
          <DayCard key={date} plannerId={plannerId} date={date} today={false} weekStart="2026-11-16" slots={slots} requestFocus={requestFocus} meals={meals} />
        ))}
      </ul>
    </PlannerPickerProvider>,
  );
}

const input = (name: string) => screen.getByRole("combobox", { name });

describe("SlotCell editing", () => {
  beforeEach(() => {
    mocks.mutations = {};
  });

  it("commits on Enter and moves breakfast to lunch to dinner to the next day's breakfast", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16", "2026-11-17"]);

    await user.type(input("Monday breakfast"), "Oats{Enter}");
    expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "breakfast", text: "Oats" });
    expect(input("Monday lunch")).toHaveFocus();
    await user.type(input("Monday lunch"), "Chili{Enter}");
    expect(input("Monday dinner")).toHaveFocus();
    await user.type(input("Monday dinner"), "Stew{Enter}");
    expect(input("Tuesday breakfast")).toHaveFocus();
  });

  it("commits on Enter and moves lunch to dinner to the next day's lunch when breakfast is off", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16", "2026-11-17"], [], NO_CHOICES, ["lunch", "dinner"]);
    expect(screen.queryByRole("combobox", { name: "Monday breakfast" })).toBeNull();

    await user.type(input("Monday lunch"), "Chili{Enter}");
    expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });
    expect(input("Monday dinner")).toHaveFocus();

    await user.type(input("Monday dinner"), "out at Thai{Enter}");
    expect(mutation("commitText")).toHaveBeenLastCalledWith({ plannerId, date: "2026-11-16", meal: "dinner", text: "out at Thai" });
    expect(input("Tuesday lunch")).toHaveFocus();
    expect(mutation("commitText")).toHaveBeenCalledTimes(2);
  });

  it("stays on the week's last dinner", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-22"]);
    await user.type(input("Sunday dinner"), "Roast{Enter}");
    expect(input("Sunday dinner")).toHaveFocus();
  });

  it("commits on blur, once, and not when nothing changed", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }]);
    await user.click(input("Monday lunch"));
    await user.tab();
    expect(mutation("commitText")).not.toHaveBeenCalled();

    await user.type(input("Monday dinner"), "Stew");
    await user.tab();
    await act(async () => input("Monday dinner").focus());
    await user.tab();
    expect(mutation("commitText")).toHaveBeenCalledTimes(1);
  });

  describe("focus after a type change lands", () => {
    const monday = "2026-11-16";
    const roast: SlotView = { date: "2026-11-15", meal: "dinner", type: "cook", name: "Roast" };
    const lunchSlot = (slot: Partial<SlotView> & { type: SlotView["type"] }): SlotView =>
      ({ date: monday, meal: "lunch", name: "", ...slot }) as SlotView;

    function setup(initial: SlotView[]) {
      const requestFocus = (id: string) => document.getElementById(id)?.focus();
      const day = (slots: SlotView[]) => (
        <ul><DayCard plannerId={plannerId} date={monday} today={false} weekStart={monday} slots={slots} requestFocus={requestFocus} /></ul>
      );
      const view = render(day(initial));
      const press = async (name: string) => {
        const user = userEvent.setup();
        await user.click(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name }));
      };
      return { press, land: (slots: SlotView[]) => view.rerender(day(slots)) };
    }

    it("focuses the Skip button when an unplanned slot becomes Skip", async () => {
      const { press, land } = setup([]);
      await press("Skip");
      land([lunchSlot({ type: "skip" })]);
      expect(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Skip" })).toHaveFocus();
    });

    it("focuses the select when Cook becomes Leftovers with a source", async () => {
      const { press, land } = setup([roast, lunchSlot({ type: "cook", name: "Chili" })]);
      await press("Leftovers");
      expect(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Leftovers" })).toHaveFocus();
      land([roast, lunchSlot({ type: "left", from: { date: "2026-11-15", meal: "dinner" } })]);
      expect(screen.getByRole("combobox", { name: "Monday lunch is leftovers of" })).toHaveFocus();
    });

    it("focuses the other-leftovers input when there is no source", async () => {
      const { press, land } = setup([]);
      await press("Leftovers");
      land([lunchSlot({ type: "left", from: "other" })]);
      expect(input("Monday lunch leftovers")).toHaveFocus();
    });

    it("focuses the input when Leftovers becomes Cook or Eat out", async () => {
      const { press, land } = setup([roast, lunchSlot({ type: "left", from: { date: "2026-11-15", meal: "dinner" } })]);
      await press("Eat out");
      land([roast, lunchSlot({ type: "out" })]);
      expect(input("Monday lunch")).toHaveFocus();
    });

    it("focuses the input when Skip becomes Cook", async () => {
      const { press, land } = setup([lunchSlot({ type: "skip" })]);
      await press("Cook");
      land([lunchSlot({ type: "cook" })]);
      expect(input("Monday lunch")).toHaveFocus();
    });

    it("focuses the input when a slot is cleared", async () => {
      const { press, land } = setup([lunchSlot({ type: "cook", name: "Chili" })]);
      await press("Cook");
      expect(mutation("setType")).toHaveBeenCalledWith({ plannerId, date: monday, meal: "lunch", type: "cook" });
      land([]);
      expect(input("Monday lunch")).toHaveFocus();
    });

    it("focuses the other-leftovers input once Other leftovers is chosen", async () => {
      const user = userEvent.setup();
      const { land } = setup([roast, lunchSlot({ type: "left", from: { date: "2026-11-15", meal: "dinner" } })]);
      await user.selectOptions(screen.getByRole("combobox", { name: "Monday lunch is leftovers of" }), "other");
      expect(mutation("setLeftoverOf")).toHaveBeenCalledWith({ plannerId, date: monday, meal: "lunch", from: "other" });
      land([roast, lunchSlot({ type: "left", from: "other" })]);
      expect(input("Monday lunch leftovers")).toHaveFocus();
    });

    it("does not pull focus back if the user moved on before the change landed", async () => {
      const { press, land } = setup([]);
      await press("Skip");
      await act(async () => input("Monday dinner").focus());
      land([lunchSlot({ type: "skip" })]);
      expect(input("Monday dinner")).toHaveFocus();
    });
  });

  it("shows the stored name when retyped text matches it apart from case or punctuation", async () => {
    const user = userEvent.setup();
    mutation("commitText").mockResolvedValue({ type: "cook", name: "Chili" });
    mutation("commitOther").mockResolvedValue({ name: "Pad thai" });
    renderDays(["2026-11-16"], [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" },
      { date: "2026-11-16", meal: "dinner", type: "left", name: "Pad thai", from: "other" },
    ]);
    await user.clear(input("Monday lunch"));
    await user.type(input("Monday lunch"), "chili!");
    await user.tab();
    expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "chili!" });
    expect(input("Monday lunch")).toHaveValue("Chili");

    await user.clear(input("Monday dinner leftovers"));
    await user.type(input("Monday dinner leftovers"), "PAD THAI{Enter}");
    expect(input("Monday dinner leftovers")).toHaveValue("Pad thai");
  });

  it("names other leftovers and moves on", async () => {
    const user = userEvent.setup();
    mutation("commitOther").mockResolvedValue({ name: "Pizza" });
    renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "left", name: "", from: "other" }]);
    await user.type(input("Monday lunch leftovers"), "Pizza{Enter}");
    expect(mutation("commitOther")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Pizza" });
    expect(input("Monday dinner")).toHaveFocus();
  });

  it("shows Saving… while a change is pending and an alert when it fails, keeping the text", async () => {
    const user = userEvent.setup();
    let reject: (error: Error) => void = () => undefined;
    mutation("commitText").mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    renderDays(["2026-11-16"]);
    await user.type(input("Monday lunch"), "Chili{Enter}");
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    expect(within(lunch).getByText("Saving…")).toBeInTheDocument();

    await act(async () => reject(new Error("offline")));
    expect(within(lunch).getByRole("alert")).toHaveTextContent("Couldn’t save this meal. Try again.");
    expect(input("Monday lunch")).toHaveValue("Chili");
  });

  describe("type buttons pressed straight after typing", () => {
    it("turns “Chipotle” then Eat out into one Eat out change, with no recipe commit", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"]);
      await user.type(input("Monday lunch"), "Chipotle");
      await user.click(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Eat out" }));
      expect(mutation("commitText")).not.toHaveBeenCalled();
      expect(mutation("setType")).toHaveBeenCalledTimes(1);
      expect(mutation("setType")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", type: "out", text: "Chipotle" });
    });

    it("queues a type press behind a save in flight instead of dropping it", async () => {
      const user = userEvent.setup();
      let resolve: (value: unknown) => void = () => undefined;
      mutation("commitText").mockImplementation(() => new Promise((done) => { resolve = done; }));
      renderDays(["2026-11-16"]);
      await user.type(input("Monday lunch"), "Chili{Enter}");
      const lunch = screen.getByRole("region", { name: "Monday lunch" });
      await user.click(within(lunch).getByRole("button", { name: "Skip" }));
      expect(mutation("setType")).not.toHaveBeenCalled();
      expect(within(lunch).getByRole("button", { name: "Skip" })).not.toHaveAttribute("aria-disabled");

      await act(async () => resolve({ type: "cook", name: "Chili" }));
      expect(mutation("setType")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", type: "skip" });
    });

    it("commits the draft once focus leaves the type buttons without a press", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"]);
      await user.type(input("Monday lunch"), "Chipotle");
      await user.tab({ shift: true });
      await user.tab({ shift: true });
      expect(mutation("commitText")).not.toHaveBeenCalled();
      await act(async () => input("Monday dinner").focus());
      expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Chipotle" });
      expect(mutation("setType")).not.toHaveBeenCalled();
    });

    it("commits the draft when a press on a type button is abandoned", async () => {
      vi.useFakeTimers();
      try {
        renderDays(["2026-11-16"]);
        const field = input("Monday lunch");
        const eatOut = within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Eat out" });
        act(() => field.focus());
        fireEvent.change(field, { target: { value: "Chipotle" } });
        fireEvent.pointerDown(eatOut);
        act(() => field.blur());
        expect(mutation("commitText")).not.toHaveBeenCalled();
        fireEvent.pointerUp(document.body);
        await act(async () => vi.advanceTimersByTime(1000));
        expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Chipotle" });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("imports a pasted link through the existing import flow and opens its result", async () => {
    const user = userEvent.setup();
    mutation("importLink").mockResolvedValue("import-1");
    const announced = vi.fn();
    window.addEventListener("perfectplate:recipe-import-started", announced);
    renderDays(["2026-11-16"]);
    await user.type(input("Monday lunch"), "https://example.com/best-chili{Enter}");
    expect(mutation("importLink")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", url: "https://example.com/best-chili" });
    expect(mutation("commitText")).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Recipe result" })).toBeInTheDocument();
    expect(announced).toHaveBeenCalledTimes(1);
    window.removeEventListener("perfectplate:recipe-import-started", announced);
  });

  it("shows where a pending import is", () => {
    const importId = "import-1" as Id<"recipeImports">;
    const recipeId = "recipe-1" as Id<"recipes">;
    renderDays(["2026-11-16"], [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Best chili", import: { importId, status: "scraping" } },
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Soup", import: { importId, status: "needs_review", recipeId } },
    ]);
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    const dinner = screen.getByRole("region", { name: "Monday dinner" });
    expect(within(lunch).getByText("Reading the recipe…")).toBeInTheDocument();
    expect(within(dinner).getByRole("link", { name: "Review and save the recipe" })).toHaveAttribute("href", "/app/recipes/recipe-1");
  });

  it("offers the import result when an import failed", async () => {
    const user = userEvent.setup();
    const importId = "import-1" as Id<"recipeImports">;
    renderDays(["2026-11-16"], [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Best chili", import: { importId, status: "failed" } },
    ]);
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    expect(within(lunch).getByText("The recipe couldn’t be imported.")).toBeInTheDocument();
    await user.click(within(lunch).getByRole("button", { name: "See why" }));
    expect(await screen.findByRole("dialog", { name: "Recipe result" })).toBeInTheDocument();
  });

  it("keeps focus in the input when its saved name goes away", async () => {
    const user = userEvent.setup();
    const slots: SlotView[] = [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }];
    const requestFocus = (id: string) => document.getElementById(id)?.focus();
    const day = (current: SlotView[]) => (
      <ul><DayCard plannerId={plannerId} date="2026-11-16" today={false} weekStart="2026-11-16" slots={current} requestFocus={requestFocus} /></ul>
    );
    const { rerender } = render(day(slots));
    await user.click(input("Monday lunch"));
    rerender(day([]));
    expect(input("Monday lunch")).toHaveFocus();
    expect(input("Monday lunch")).toHaveValue("");
    expect(input("Monday lunch")).toHaveAttribute("placeholder", "Plan lunch");
  });

  describe("the recipe picker", () => {
    const chili = "recipe-chili" as Id<"recipes">;
    const picker: PickerData = {
      recipes: [
        { recipeId: chili, title: "Chili", source: "Manual" },
        { recipeId: "recipe-pep-1" as Id<"recipes">, title: "Shrimp Peperonata", source: "seriouseats.com", ingredientCount: 12 },
        { recipeId: "recipe-pep-2" as Id<"recipes">, title: "Shrimp Peperonata", source: "Manual", ingredientCount: 0 },
        { recipeId: "recipe-shrimp" as Id<"recipes">, title: "Shrimp", source: "Manual" },
      ],
      meals: ["Chipotle"],
    };
    const options = () => screen.queryAllByRole("option").map((option) => option.textContent);

    it("filters as you type, tells same-named recipes apart and offers an explicit Create row", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [], picker);
      const field = input("Monday lunch");
      expect(field).toHaveAttribute("aria-expanded", "false");
      await user.type(field, "p");
      expect(field).toHaveAttribute("aria-expanded", "true");
      expect(options()).toEqual([
        "Shrimp PeperonataManual · 0 ingredients",
        "Shrimp Peperonataseriouseats.com · 12 ingredients",
        "Create recipe “p”",
      ]);
      await user.keyboard("{Escape}");
      expect(field).toHaveAttribute("aria-expanded", "false");
      expect(field).toHaveFocus();
    });

    it("picks the highlighted recipe with Enter and moves on, creating nothing", async () => {
      const user = userEvent.setup();
      mutation("attachRecipe").mockResolvedValue({ name: "Chili" });
      renderDays(["2026-11-16"], [], picker);
      await user.type(input("Monday lunch"), "chi");
      await user.keyboard("{ArrowDown}");
      expect(input("Monday lunch")).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
      expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{Enter}");
      expect(mutation("attachRecipe")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", recipeId: chili });
      expect(mutation("commitText")).not.toHaveBeenCalled();
      expect(mutation("createRecipeForSlot")).not.toHaveBeenCalled();
      expect(input("Monday lunch")).toHaveValue("Chili");
      expect(input("Monday dinner")).toHaveFocus();
    });

    it("keeps typed text as a plain name on Enter or leaving the field", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [], picker);
      await user.type(input("Monday lunch"), "Shrimp Pepero ata{Enter}");
      expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Shrimp Pepero ata" });
      await user.type(input("Monday dinner"), "Chil");
      await user.tab();
      expect(mutation("commitText")).toHaveBeenLastCalledWith({ plannerId, date: "2026-11-16", meal: "dinner", text: "Chil" });
      expect(mutation("attachRecipe")).not.toHaveBeenCalled();
      expect(mutation("createRecipeForSlot")).not.toHaveBeenCalled();
    });

    it("creates a recipe only from the Create row, picked with a tap", async () => {
      const user = userEvent.setup();
      mutation("createRecipeForSlot").mockResolvedValue({ recipeId: "recipe-new", name: "Lentil soup" });
      renderDays(["2026-11-16"], [], picker);
      await user.type(input("Monday lunch"), "Lentil soup");
      await user.click(screen.getByRole("option", { name: "Create recipe “Lentil soup”" }));
      expect(mutation("createRecipeForSlot")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", name: "Lentil soup" });
      expect(mutation("commitText")).not.toHaveBeenCalled();
      expect(input("Monday lunch")).toHaveFocus();
      expect(input("Monday lunch")).toHaveAttribute("aria-expanded", "false");
    });

    it("offers eat-out names in an Eat out slot", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "out", name: "" }], picker);
      await user.type(input("Monday lunch"), "chi");
      expect(options()).toEqual(["Chipotle"]);
      await user.click(screen.getByRole("option", { name: "Chipotle" }));
      expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Chipotle" });
    });

    it("still turns typed text plus Eat out into one change while the list is open", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [], picker);
      await user.type(input("Monday lunch"), "Chi");
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
      await user.click(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Eat out" }));
      expect(mutation("commitText")).not.toHaveBeenCalled();
      expect(mutation("setType")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", type: "out", text: "Chi" });
    });

    it("says when a meal has no recipe and offers to choose or import one", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }], picker);
      const lunch = screen.getByRole("region", { name: "Monday lunch" });
      expect(within(lunch).getByText("No recipe attached")).toBeInTheDocument();

      await user.click(within(lunch).getByRole("button", { name: "Choose recipe" }));
      expect(input("Monday lunch")).toHaveFocus();
      expect(options()[0]).toBe("ChiliManual");
      expect(options()).toHaveLength(5);

      mutation("importLink").mockResolvedValue("import-1");
      await user.click(within(lunch).getByRole("button", { name: "Import from link" }));
      const dialog = await screen.findByRole("dialog", { name: "Import a recipe for Chili" });
      await user.type(within(dialog).getByLabelText("Recipe link"), "https://example.com/chili");
      await user.click(within(dialog).getByRole("button", { name: "Import recipe" }));
      expect(mutation("importLink")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", url: "https://example.com/chili" });
      expect(await screen.findByRole("dialog", { name: "Recipe result" })).toBeInTheDocument();
    });

    it("says when a link can't be imported", async () => {
      const user = userEvent.setup();
      mutation("importLink").mockRejectedValue(new Error("Not a recipe link"));
      renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }], picker);
      await user.click(screen.getByRole("button", { name: "Import from link" }));
      const dialog = await screen.findByRole("dialog", { name: "Import a recipe for Chili" });
      await user.type(within(dialog).getByLabelText("Recipe link"), "https://example.com/chili");
      await user.click(within(dialog).getByRole("button", { name: "Import recipe" }));
      expect(within(dialog).getByRole("alert")).toHaveTextContent("We couldn’t import that link.");
    });

    it("lets a slot with a recipe change which recipe it uses", async () => {
      const user = userEvent.setup();
      renderDays(["2026-11-16"], [{
        date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili",
        recipe: { recipeId: chili, title: "Chili", ingredientCount: 3, available: true },
      }], picker);
      const lunch = screen.getByRole("region", { name: "Monday lunch" });
      expect(within(lunch).queryByText("No recipe attached")).toBeNull();
      await user.click(within(lunch).getByRole("button", { name: "Change the recipe for Chili" }));
      expect(input("Monday lunch")).toHaveFocus();
      expect(options()).toContain("ShrimpManual");
    });
  });
});
