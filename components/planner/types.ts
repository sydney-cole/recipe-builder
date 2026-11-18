import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type SlotView = FunctionReturnType<typeof api.planner.week>["slots"][number];

export const SLOT_TYPES = [
  { type: "cook", label: "Cook" },
  { type: "left", label: "Leftovers" },
  { type: "out", label: "Eat out" },
  { type: "skip", label: "Skip" },
] as const;
