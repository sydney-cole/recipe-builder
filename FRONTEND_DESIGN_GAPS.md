# Frontend design gaps for generated recipes

This is an implementation handoff, not a finished design specification. The
backend behaviors below now exist, but their user interfaces have not been
designed or connected. Resolve these questions in the next `DESIGN.md` pass
before building the corresponding frontend.

## Recipe generation and review

- **Processing state:** presentation for the new `processing` import state while
  the OpenAI agent converts Firecrawl evidence into structured data.
- **Review-needed state:** placement and hierarchy for agent warnings, truncated
  scrape warnings, and the action that acknowledges a generated recipe.
- **Generated-result handoff:** whether a completed import opens the recipe,
  opens the generated grocery list, or presents both as next actions.

## Recipe Book cards and recipe editing

- **Recipe-card visual design:** the current design document gives general card
  anatomy, but there is no approved high-fidelity card layout for generated
  recipes, attribution, warning badges, notes, or edited-state indicators.
- **Edit mode:** inline versus dedicated editing for title, servings, times,
  ingredient rows, quantities, units, optional flags, instruction order, and
  instruction text.
- **Notes:** location, collapsed/expanded behavior, character-count feedback,
  autosave versus explicit save, and the empty state for a recipe with no notes.
- **Deletion:** confirmation language and post-delete destination for removing a
  recipe card. A recipe deletion does not delete its independently editable
  grocery list.
- **Unsaved work:** navigation blocking, save confirmation, optimistic feedback,
  and recovery after a failed edit have not been specified.

## Generated grocery lists

- **List creation notice:** how to explain that non-optional recipe ingredients
  were automatically placed in a recipe-specific list.
- **Recipe relationship:** presentation for “Generated from [recipe]” and what
  remains when the recipe card is later removed.
- **Editing controls:** final responsive treatment for adding, renaming,
  reordering, checking, changing quantities/units, and removing grocery items.
- **Whole-list deletion:** confirmation, undo policy, and the destination after
  deleting a generated or manually created list.
- **Optional ingredients:** an affordance for copying optional recipe ingredients
  into the grocery list later is not designed.
- **Quantity semantics:** behavior for ranges, fractions, unknown quantities, and
  serving-based scaling has not been designed.

## Error and accessibility states

- Model or gateway unavailable, invalid agent output, and retry UI.
- Screen-reader announcements for processing, saves, deletions, and item edits.
- Keyboard interactions for ingredient/instruction reordering and destructive
  confirmations.
- Mobile layouts for long ingredient names, multi-line quantities, notes, and
  instruction editing.

## Backend boundary to preserve

Editing a recipe never silently rewrites an existing grocery list, and editing a
grocery item never changes the source recipe. The frontend must communicate this
separation wherever both records appear together.
