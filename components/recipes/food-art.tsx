import { cn } from "@/lib/utils";
import type { Recipe } from "@/lib/data/types";

export function FoodArt({ variant, label }: { variant: Recipe["art"]; label?: string }) {
  return <div className={cn("food-art", variant)} role="img" aria-label={label ?? "Abstract food illustration"}>{label && <span className="food-art-label">{label}</span>}</div>;
}
