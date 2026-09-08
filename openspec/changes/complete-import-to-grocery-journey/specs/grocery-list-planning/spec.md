## Purpose

Defines persistent recipe-to-list planning and a dependable mobile grocery-list experience that retains the origin of recipe ingredients.

## ADDED Requirements

### Requirement: User can create and access personal grocery lists
The system SHALL allow an authenticated user to create, rename, open, complete, and archive their own grocery lists, and SHALL persist those changes across navigation and refreshes.

#### Scenario: User creates a list
- **WHEN** an authenticated user submits a valid list name
- **THEN** the system creates an active empty list owned by that user and opens it for editing

#### Scenario: User has no grocery lists
- **WHEN** the user's grocery-list collection is empty
- **THEN** the system presents an honest empty state with an action to create the first list

#### Scenario: User requests another user's list
- **WHEN** an authenticated user requests a grocery list they do not own
- **THEN** the system reveals no list or item data and permits no mutation

### Requirement: User can add selected recipe ingredients
The system SHALL allow a user viewing an accessible recipe to select all ingredients or a subset, choose the serving quantity, and add the selection to an existing or newly created grocery list.

#### Scenario: User adds all ingredients
- **WHEN** the user selects all ingredients and a target grocery list
- **THEN** the system adds every ingredient using quantities scaled to the selected serving count and confirms the destination list

#### Scenario: User adds a subset of ingredients
- **WHEN** the user deselects ingredients they already have before confirming
- **THEN** only the remaining selected ingredients are added to the target list

#### Scenario: No ingredient is selected
- **WHEN** the user attempts to continue with no selected ingredients
- **THEN** the system keeps the selection step open and explains that at least one ingredient is required

### Requirement: Compatible grocery items aggregate predictably
The system SHALL merge selected recipe ingredients only when their normalized ingredient identity and units are compatible, SHALL retain separate items when safe quantity conversion is unavailable, and SHALL preserve every contributing recipe source.

#### Scenario: Compatible ingredient already exists
- **WHEN** an added recipe ingredient matches an unchecked list item with a compatible unit
- **THEN** the system combines the calculable quantities into one item and records both recipe sources

#### Scenario: Ingredient units are incompatible
- **WHEN** matching ingredients use units the system cannot safely convert
- **THEN** the system retains separate understandable entries rather than guessing a combined quantity

#### Scenario: Same recipe is added repeatedly
- **WHEN** the same recipe ingredient and serving selection are submitted to the same list more than once
- **THEN** the system avoids an accidental duplicate addition and communicates the existing source association

### Requirement: Grocery-list editing is persistent and recoverable
The system SHALL allow the owner to add one-off items; edit item names, quantities, units, and notes; check or uncheck items; and remove items, with every confirmed edit persisted.

#### Scenario: User checks an item while shopping
- **WHEN** the owner marks an item complete
- **THEN** the item is visually distinguished, the remaining-item count updates, and the state remains after refresh

#### Scenario: User edits an item
- **WHEN** the owner confirms valid item edits
- **THEN** the updated values remain visible across navigation and refreshes

#### Scenario: User removes an item
- **WHEN** the owner removes an item
- **THEN** the system updates the list immediately and offers a time-bounded undo that restores the item and its source context

#### Scenario: Edit cannot be persisted
- **WHEN** a list mutation fails
- **THEN** the interface identifies the unsaved action, restores or retains the last confirmed state, and offers a retry

### Requirement: Source context remains available
The system SHALL show which recipe or recipes contributed a grocery item without requiring the user to infer provenance from the item name.

#### Scenario: Item came from one recipe
- **WHEN** a grocery item has one recipe source
- **THEN** the item identifies that recipe and provides a path back to its accessible detail page

#### Scenario: Item combines multiple recipes
- **WHEN** a grocery item aggregates ingredients from multiple recipes
- **THEN** the user can inspect every contributing recipe and the quantity contribution retained for each source

### Requirement: Mobile shopping remains operable
The system SHALL keep primary grocery-list controls keyboard accessible and usable with touch targets appropriate for one-handed mobile shopping, while preserving readable item names and quantities at narrow widths.

#### Scenario: User shops on a narrow viewport
- **WHEN** the grocery list is displayed on a supported mobile width
- **THEN** checking, editing, adding, and removing items remain reachable without horizontal page scrolling

#### Scenario: User navigates with a keyboard or assistive technology
- **WHEN** the user operates grocery controls without a pointer
- **THEN** controls have programmatic names, visible focus, logical order, and announced status feedback
