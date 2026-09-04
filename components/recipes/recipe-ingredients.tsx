"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Ingredient = {
  _id: string;
  originalText: string;
  name: string;
  quantity?: number;
  unit?: string;
  preparation?: string;
  notes?: string;
  isOptional: boolean;
};

export function formatQuantity(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(rounded);
}

export function scaledIngredientText(
  ingredient: Ingredient,
  multiplier: number,
) {
  if (ingredient.quantity === undefined || multiplier === 1) {
    return ingredient.originalText;
  }
  const details = [ingredient.unit, ingredient.name, ingredient.preparation]
    .filter(Boolean)
    .join(" ");
  const suffix = [ingredient.notes, ingredient.isOptional ? "optional" : undefined]
    .filter(Boolean)
    .join(", ");
  return `${formatQuantity(ingredient.quantity * multiplier)} ${details}${suffix ? `, ${suffix}` : ""}`;
}

export function RecipeIngredients({
  ingredients,
  initialServings,
}: {
  ingredients: Ingredient[];
  initialServings: number;
}) {
  const baseServings = Math.max(1, initialServings);
  const [servings, setServings] = useState(baseServings);
  const multiplier = servings / baseServings;

  return (
    <section>
      <div className="section-row">
        <div>
          <h2 className="section-heading">Ingredients</h2>
          <p className="section-copy" aria-live="polite">For {servings} servings</p>
        </div>
        <div className="cluster">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Decrease servings"
            disabled={servings <= 1}
            onClick={() => setServings((current) => Math.max(1, current - 1))}
          >
            <Minus size={16} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Increase servings"
            onClick={() => setServings((current) => current + 1)}
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>
      <Card>
        <CardContent>
          <ul className="divide-y divide-border">
            {ingredients.map((ingredient) => (
              <li className="py-3 text-sm" key={ingredient._id}>
                {scaledIngredientText(ingredient, multiplier)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
