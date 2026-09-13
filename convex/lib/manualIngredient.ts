const unicodeFractions: Record<string, string> = {
  "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

const units: Record<string, string> = {
  cup: "cup", cups: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbsps: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tsps: "tsp",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  ounce: "oz", ounces: "oz", oz: "oz",
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", l: "l",
  pinch: "pinch", pinches: "pinch", clove: "clove", cloves: "clove",
  can: "can", cans: "can", package: "package", packages: "package",
  stick: "stick", sticks: "stick", bunch: "bunch", bunches: "bunch",
  slice: "slice", slices: "slice", piece: "piece", pieces: "piece",
};

function numericQuantity(value: string) {
  return value.split(/\s+/).reduce((total, part) => {
    if (part.includes("/")) {
      const [numerator, denominator] = part.split("/").map(Number);
      return total + (denominator ? numerator / denominator : 0);
    }
    return total + Number(part);
  }, 0);
}

export type ParsedManualIngredient = {
  originalText: string;
  name: string;
  normalizedName: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  preparation?: string;
};

export function parseManualIngredient(value: string): ParsedManualIngredient {
  const originalText = value.trim();
  const expanded = originalText.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2").replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (fraction) => unicodeFractions[fraction]);
  const match = expanded.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(.+)$/);
  if (!match) {
    const name = originalText.toLowerCase().replace(/\s+/g, " ");
    return { originalText, name, normalizedName: name };
  }

  const quantityText = match[1];
  const remainder = match[2].trim();
  const [unitCandidate = "", ...rest] = remainder.split(/\s+/);
  const unit = units[unitCandidate.toLowerCase().replace(/[.,]$/, "")];
  const nameAndPreparation = (unit ? rest.join(" ") : remainder).trim();
  const [rawName, ...preparationParts] = nameAndPreparation.split(",");
  const name = (rawName.trim() || nameAndPreparation).toLowerCase().replace(/\s+/g, " ");
  const preparation = preparationParts.join(",").trim() || undefined;
  return {
    originalText,
    name,
    normalizedName: name,
    quantity: numericQuantity(quantityText),
    quantityText,
    unit,
    preparation,
  };
}
