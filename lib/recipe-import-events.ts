export const RECIPE_IMPORT_STARTED_EVENT = "perfectplate:recipe-import-started";

export function announceRecipeImport(importId: string) {
  window.dispatchEvent(
    new CustomEvent(RECIPE_IMPORT_STARTED_EVENT, { detail: { importId } }),
  );
}

