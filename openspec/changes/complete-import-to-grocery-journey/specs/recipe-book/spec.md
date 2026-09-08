## Purpose

Defines the trustworthy personal recipe collection users receive after reviewing imports and the actions that continue into meal preparation.

## ADDED Requirements

### Requirement: Recipe Book contains persisted user recipes
The system SHALL show an authenticated user only recipes they imported or explicitly saved, and SHALL not mix unsaved catalog content or local sample recipes into the personal Recipe Book.

#### Scenario: Reviewed import is saved
- **WHEN** a user completes recipe review successfully
- **THEN** the resulting recipe appears in that user's Recipe Book without requiring a refresh

#### Scenario: Another user owns a private recipe
- **WHEN** a user lists or searches their Recipe Book
- **THEN** recipes owned only by another user are not returned

#### Scenario: Public recipe has not been saved
- **WHEN** a recipe is publicly readable but the user has not saved it
- **THEN** it does not appear as part of that user's personal Recipe Book

### Requirement: Collection states are honest and actionable
The system SHALL provide distinct loading, empty, populated, no-search-results, and failure states using persisted collection data.

#### Scenario: Recipe collection is empty
- **WHEN** the user's Recipe Book contains no recipes
- **THEN** the system explains how to import the first recipe and provides a direct import action

#### Scenario: Recipe collection is loading
- **WHEN** collection data has not resolved
- **THEN** the system presents a labeled loading state without displaying fictional recipes or counts

#### Scenario: Recipe collection cannot be loaded
- **WHEN** the collection request fails
- **THEN** the system presents a recoverable error state and does not misrepresent the failure as an empty collection

#### Scenario: Search has no matches
- **WHEN** a user's search matches none of their saved recipes
- **THEN** the system preserves the query and suggests clearing or changing it without suggesting the collection is empty

### Requirement: User can find recipes in their collection
The system SHALL allow users to search their Recipe Book by meaningful recipe text and sort the visible results by recent addition, shortest available total time, or title.

#### Scenario: User searches the Recipe Book
- **WHEN** the user enters a search term
- **THEN** the visible collection is limited to their recipes matching that term

#### Scenario: User changes the sort order
- **WHEN** the user chooses an available sort order
- **THEN** the current matching recipes are reordered without changing collection membership

### Requirement: Recipe detail supports cooking and planning
The system SHALL provide an accessible recipe detail view containing the saved title, source, servings, timing, ingredients, and ordered instructions, with serving adjustments that update calculable ingredient quantities.

#### Scenario: User opens an accessible recipe
- **WHEN** a user opens a recipe in their Recipe Book
- **THEN** the system displays its persisted content and offers actions to view the original source and plan groceries

#### Scenario: User changes servings
- **WHEN** the user increases or decreases the serving count
- **THEN** calculable ingredient quantities update proportionally while unstructured ingredient text remains understandable

#### Scenario: Recipe is missing or inaccessible
- **WHEN** a recipe does not exist or is not accessible to the current user
- **THEN** the system reveals no recipe content and provides a safe route back to the Recipe Book

### Requirement: Authenticated summaries use collection truth
The system SHALL derive Recipe Book counts, recent recipes, and import-attention summaries shown outside the collection page from the same persisted user-owned data.

#### Scenario: Dashboard is displayed
- **WHEN** an authenticated user visits the home dashboard
- **THEN** all recipe counts, recent items, and attention states correspond to that user's current persisted records

#### Scenario: User saves their first recipe
- **WHEN** a completed review adds the first recipe to the user's collection
- **THEN** empty-state calls to action are replaced by the new recipe and accurate collection summary
