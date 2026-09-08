## Purpose

Defines how users verify and correct source-grounded recipe drafts generated from imported links before committing them to their personal Recipe Book.

## ADDED Requirements

### Requirement: Owner can review extracted content
The system SHALL provide the import owner a review page for every review-ready import containing the original source and the title, servings or yield, timing, ingredients, and ordered instructions available in the OpenAI-generated draft.

#### Scenario: Review-ready import is opened
- **WHEN** the owner opens an import whose source retrieval and draft generation succeeded
- **THEN** the system displays the generated recipe in an editable review form, identifies it as requiring review, and provides a link to the original source

#### Scenario: Import is not ready
- **WHEN** the owner requests review for an import that is still processing or has failed
- **THEN** the system shows the current import state and does not present incomplete content as ready to save

#### Scenario: Non-owner requests review
- **WHEN** a user requests the review page for an import they do not own
- **THEN** the system reveals no import or generated recipe data

### Requirement: Extracted recipe can be corrected
The system SHALL allow the owner to correct the generated recipe title, description, servings, timing, ingredients, and instruction text and order before saving.

#### Scenario: User corrects extracted fields
- **WHEN** the owner edits valid recipe fields and submits the review
- **THEN** the saved recipe reflects the corrected values rather than the original extracted values

#### Scenario: User adds or removes recipe rows
- **WHEN** the owner adds, removes, or reorders ingredients or instructions during review
- **THEN** the review preserves the resulting ordered collection for validation and saving

### Requirement: Review validation protects recipe usefulness
The system SHALL require a non-empty title, at least one non-empty ingredient, and at least one non-empty instruction before a reviewed recipe can be saved, and SHALL identify validation problems next to the relevant controls.

#### Scenario: Required content is missing
- **WHEN** the owner attempts to save a review that lacks required recipe content
- **THEN** the system keeps the review open, preserves the entered values, and identifies each field that must be corrected

#### Scenario: Optional values are unavailable
- **WHEN** description, timing, servings, or optional ingredient details are absent
- **THEN** the system allows the recipe to be saved without inventing values

#### Scenario: Generated value is unsupported by the source
- **WHEN** the owner compares a generated value with the original source and finds it inaccurate or unsupported
- **THEN** the owner can correct or remove the value before saving

### Requirement: Saving is atomic and idempotent
The system SHALL save the reviewed recipe, its ordered ingredients, and the user's Recipe Book relationship as one logical operation, then mark the import completed and link it to the saved recipe.

#### Scenario: Valid review is saved
- **WHEN** the owner confirms a valid review
- **THEN** exactly one recipe appears in the owner's Recipe Book and the completed import links to that recipe

#### Scenario: Save request is repeated
- **WHEN** the same completed review submission is received more than once
- **THEN** the system returns the existing saved recipe without creating duplicate recipes or ingredients

#### Scenario: Save cannot complete
- **WHEN** any required part of the save operation fails
- **THEN** the import remains reviewable, no partial recipe is exposed in the Recipe Book, and the user receives a recoverable error

### Requirement: Unsaved review changes are explicit
The system SHALL warn the user before navigation would discard unsaved review edits while keeping the underlying import available for later review.

#### Scenario: User leaves after making edits
- **WHEN** the owner attempts to navigate away from a review with unsaved changes
- **THEN** the system asks for confirmation before discarding those edits

#### Scenario: User returns to an uncompleted import
- **WHEN** the owner reopens a review-ready import that was not saved
- **THEN** the system presents the persisted generated draft for a new review attempt
