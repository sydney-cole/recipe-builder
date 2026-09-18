# Hackathon log

- **Project:** PerfectPlate
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps home cooks discover and import recipes, turn ingredients into a grocery list, and save personal recipe cards with notes.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** https://striped-meadowlark-868.convex.cloud (development)
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/agent, @convex-dev/workflow
- **Convex features:** schema, tables, indexes, full-text search, queries, realtime queries, mutations, actions, HTTP actions, file storage, registered components
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5-mini through the direct OpenAI API; Convex AI Gateway remains configurable for a future switch
- **Started:** 2026-09-01T21:12:33Z
- **Last updated:** 2026-09-18T19:58:56Z

## Log

### 2026-09-01 - d00fad0
Initialized the project repository with its recipe-builder README (`README.md`).

### 2026-09-02 - 8f57fb0
Designed the database for recipe URL imports, reusable recipe cards, normalized
ingredients, saved recipes, and grocery lists with recipe provenance. Added
Convex Auth with email/password authentication, its HTTP routes and tables, and
a current-user query. Convex features: schema, tables, indexes, full-text
search, queries, HTTP actions (`convex/schema.ts`, `convex/auth.ts`,
`convex/auth.config.ts`, `convex/http.ts`, `convex/users.ts`).

### 2026-09-02 - c28f953
Added repeatable sample-data mutations for users, imported recipes, normalized
ingredients, saved recipes, and grocery-list provenance (`convex/seed.ts`).

### 2026-09-03 - 8e7718f
Registered the official Firecrawl Convex integration with API-key and optional
signed-webhook configuration, then refreshed generated component types.
Convex features: component configuration and HTTP actions
(`convex/convex.config.ts`, `convex/http.ts`).

### 2026-09-03 - 71aaeaa
Built the responsive PerfectPlate frontend scaffold with landing and auth
screens, recipe discovery, Recipe Book, recipe import states, food-blog
subscriptions, editable grocery lists, settings, and reusable UI states. The
flows use isolated mock data until Convex and AgentMail are connected
(`app/`, `components/`, `lib/data/mock-data.ts`, `DESIGN.md`, `README.md`).

### 2026-09-04 - 492a345
Connected the Next.js frontend to Convex Auth with password account flows,
sign-out, cookie-backed route protection, and authenticated recipe queries.
Replaced the Recipe Book mock data with realtime seeded recipes and
server-rendered details (`proxy.ts`, `app/convex-client-provider.tsx`,
`components/auth/auth-form.tsx`, `convex/recipes.ts`).

### 2026-09-04 - cd8095e
Registered the official AgentMail Convex component and added an authenticated
connection to the existing project inbox, signed webhook ingestion, and
user-owned recipe-import queuing for links received by email. Replaced the demo
inbox and import list with realtime Convex data. Live email receipt still
requires the provider API key and webhook secret to be configured outside Git
(`convex/convex.config.ts`,
`convex/email.ts`, `convex/http.ts`, `components/imports/email-intake.tsx`).

### 2026-09-04 - a12b3b1
Hardened recipe ownership checks, inbox metadata validation, URL normalization,
and duplicate import handling. Added working recipe serving controls, corrected
unfinished UI claims, and introduced CI plus 40 tests across Convex access,
domain logic, and interactive components (`convex/recipes.ts`,
`convex/email.ts`, `convex/lib/urls.ts`, `.github/workflows/ci.yml`).

### 2026-09-09 - 74f75a0
Added a durable Firecrawl ingestion workflow shared by direct links,
AgentMail-forwarded links, and trusted agent-discovered links. Scraped markdown,
page metadata, and bounded recipe JSON-LD hints are stored as provenance-linked
artifacts for a future OpenAI agent, with retry, deduplication, stale-callback,
and failure handling (`convex/recipeIngestion.ts`, `convex/schema.ts`,
`convex/email.ts`, `convex/lib/recipeScrape.ts`).

### 2026-09-10 - 6fefda3
Connected scraped recipe evidence to a persistent Convex Agent using an OpenAI
model through the Convex AI Gateway. The durable workflow now creates a saved,
editable recipe card and an independent grocery list, retains source
attribution, records review warnings, and enforces per-user editing and deletion
for recipe fields, ingredients, notes, lists, and grocery items. Added backend
coverage and documented unresolved frontend design decisions
(`convex/recipeAgent.ts`, `convex/recipeAgentData.ts`, `convex/recipeCards.ts`,
`convex/groceryLists.ts`, `FRONTEND_DESIGN_GAPS.md`).

### 2026-09-10 - 8b738a0
Separated manual and recipe-backed grocery-list creation. New manual lists now
open as empty editable lists, recipe processing no longer creates a list
automatically, and **Create list** creates a recipe-named list on demand from
the recipe's non-optional ingredients. Added authenticated, idempotent Convex
creation and atomic save/update operations so manual and recipe-backed lists
persist their names, additions, edits, checked state, and removals, then return
the user to the All grocery lists page after a successful save. Added an
overflow menu for list-only deletion and merging. Combining two owned lists
consolidates matching ingredient units into a user-named replacement and removes
both source lists atomically. The merge is idempotent, and the dialog starts
with a required Choose a list prompt that is excluded from the selectable list
options.
Replaced the dashboard's mock saved-recipe cards with realtime Convex recipes so
their grocery-list action is functional. Deployed the backend to the development
deployment and verified list combination end to end in the local application.
Switched recipe extraction to the server-side OpenAI provider so the free Convex
deployment can use its deployment-scoped `OPENAI_API_KEY`; retained a documented
provider switch for a future move to Convex AI Gateway. Added frontend and
authenticated backend test coverage (`convex/groceryLists.ts`,
`convex/recipeAgent.ts`, `convex/recipeAgentData.ts`, `components/grocery/`,
`components/recipes/`, `app/(app)/app/grocery-lists/`,
`app/(app)/app/page.tsx`).

### 2026-09-11 - 94f9063
Replaced mock Discover recommendations with an authenticated Convex action that
accepts one or more ingredient, flavor, cuisine, or dish constraints. Firecrawl
searches and extracts evidence from up to eight live recipe pages, then the
persistent OpenAI-powered Convex Agent ranks one to three choices without
inventing ratings or review counts. Choosing a result now queues its source URL
through the existing durable Firecrawl recipe-import workflow and opens import
progress. Added loading, empty, validation, failure, rating-evidence, and source
attribution states plus focused UI tests (`convex/recipeDiscovery.ts`,
`convex/recipeIngestion.ts`, `components/discovery/discover-form.tsx`). Selected
search constraints remain visible as chips, can be accumulated back into the
input for reuse, and are removed only through their dedicated accessible remove
controls. The six-chip limit evicts the oldest constraint when a newer one is
added. The new functions are on the development deployment; live ranking
verification is pending successful configuration of the deployment-scoped
OpenAI API key.

### 2026-09-11 - 45fdecb
Consolidated manual recipe intake on Discover: users can now either ask the
agent to find recipes or paste a known recipe URL on the same page, and both
choices enter the existing durable Firecrawl import pipeline. Renamed the
email destination to Inboxes and reduced it to AgentMail inbox connection and
address access; removed the recent-import feed and moved every manual-import
link to Discover. Successful queues now explain that the resulting card will
appear in the Recipe Book instead of redirecting to inbox setup. Added focused
interaction and page-scope tests (`components/discovery/recipe-link-import.tsx`,
`components/discovery/discover-form.tsx`, `components/imports/email-intake.tsx`,
`components/app-shell/app-shell.tsx`). Refined the Discover results area as
Recommended recipes, describing its evidence-ranked three-result maximum, and
fixed the search input spacing so its text clears the search icon. Added a
clear transition into known-link importing that explains the editable recipe
card and grocery-list workflow while matching the primary page-header styling.
Increased the spacing between Discover sections to keep each heading visually
distinct. Aligned the discovery and known-link forms to the same responsive
input and primary-action grid, including matching panel insets, button size,
and placement. Increased the shared spacing between each major section and
shortened the known-link form heading to Paste a recipe link. Added a dedicated
responsive section-gap rule so the larger spacing is not overridden by the
shared stack layout. Matched the Paste a recipe link title typography to the
primary discovery prompt. Refined section-specific spacing so the known-recipe
heading uses the same prompt-to-input rhythm as discovery while retaining clear
separation from the preceding search panel and recommendations. Matched the
known-link panel background to the discovery search panel.

The Recommended recipes section now loads automatically from a live Firecrawl
search for highly rated recipe pages. The persistent OpenAI-powered Convex
Agent ranks no more than three results and returns evidence-grounded ingredient
lines and ordered instructions before rendering. Users can open a recommendation
in an accessible detail dialog, review the complete recipe and source, and then
queue it into the existing Recipe Book import workflow. Verified on the
development deployment with two live recommendations; one opened with nine
ingredients and seven instruction steps (`convex/recipeDiscovery.ts`,
`components/discovery/discover-form.tsx`). Added an explicit live-search status
instead of showing unlabeled skeletons alone. Kept the broader eight-page
evidence pool after a three-candidate trial returned no complete recipes; the
user-visible result remains capped at three. Removed a brittle numeric-rating
cutoff that hid complete recipes when publishers did not expose machine-readable
ratings; the best-rated search query and evidence-based agent ranking remain.
Added a structured Firecrawl fallback for cases where the agent omits otherwise
complete extracted recipes, ranking those candidates by available rating,
review-count, and search-position evidence. Re-deployed and verified the live
Discover page renders three recommendations; opening the first displayed both
ingredients and ordered instructions.
Cached the shared Recommended recipes payload in Convex with an atomic daily
refresh claim, so page visits reuse the stored complete cards and at most one
web scrape and agent-ranking attempt occurs in each 24-hour window. Concurrent
visits wait for the claimed refresh instead of duplicating it. Deployed the
cache table and internal functions, then verified an initial live refresh and a
second three-card response from cache in under one second
(`convex/recipeDiscoveryCache.ts`, `convex/recipeDiscovery.ts`,
`convex/schema.ts`).

Added meal-image ingestion to the durable recipe workflow. Firecrawl recipe
JSON-LD is preferred, with page metadata as a fallback; accepted raster images
are size- and type-bounded before being copied into Convex file storage. Recipe
queries resolve the current storage URL, and cards and details fall back to the
existing abstract food art when an image is missing or fails to load. Added a
bounded internal backfill for existing recipes and verified stored images on the
development deployment (`convex/lib/recipeScrape.ts`, `convex/recipeImages.ts`,
`convex/recipeImagesData.ts`, `convex/recipeIngestion.ts`, `convex/recipes.ts`,
`components/recipes/food-art.tsx`).

Simplified navigation around the completed discovery workflow: removed the
global Recipe Book search from every page, moved Inboxes and the boxed Log out
action to the right edge of the top bar, removed Subscriptions from desktop and
mobile navigation, and removed the duplicate Discover dinner action from Home.
The remaining Home import action now opens Discover, where known-link imports
live (`components/app-shell/app-shell.tsx`, `app/(app)/app/page.tsx`,
`app/globals.css`).

### 2026-09-13 - 61187f6
Separated newly created recipe cards from the Recipe Book: realtime import
notifications now show processing, failure, and an in-page preview, while users
explicitly save a card or set it as the current Home recipe. Added recent-card
status, blocked-source checks, and a manual recipe fallback. Grocery actions can
create a list or add to an existing one, preserving comma-separated per-recipe
ingredient provenance while parsing amounts, normalizing names, merging common
ingredient aliases, and converting compatible volume and weight units. Hardened
URL, image, validator, and UI boundaries with expanded tests
(`convex/recipeCards.ts`, `convex/recipes.ts`, `convex/groceryLists.ts`,
`convex/lib/manualIngredient.ts`, `components/recipes/`, `components/grocery/`).

### 2026-09-14 - 51226a2
Kept recipe selection on Discover: agent searches now present up to three
choices in an in-page dialog, and pasted links show their processing result in
the same page. Selecting a search result stores its already-loaded ingredients
and instructions as a private preview without a second Firecrawl scrape; pasted
links still use the durable importer once. The standalone preview can return
home, save to the Recipe Book, become the current recipe, or open a new grocery
list, whose Save action returns home (`components/discovery/`,
`app/(app)/app/recipes/`, `convex/recipePreviews.ts`, `convex/email.ts`,
`components/recipes/recipe-preview-actions.tsx`, `convex/groceryLists.ts`).
Reduced explicit search evidence from eight pages to five while retaining the
existing once-per-24-hours recommendation cache. Added authenticated backend,
interaction, scrape, and image coverage for the merged workflow
(`convex/recipeDiscovery.ts`, `convex/functions.test.ts`,
`convex/lib/recipeScrape.test.ts`, `convex/recipeImages.test.ts`).

### 2026-09-17 - 2d4dc48
Added an email-code password recovery flow to Convex Auth using the configured
AgentMail inbox, plus accessible reset screens, login-field icon spacing, and
setup documentation for `AGENTMAIL_INBOX_ID` (`convex/auth.ts`,
`components/auth/`, `app/(auth)/forgot-password/`, `README.md`).

Added an explicitly temporary Firecrawl-free Discover mode with three complete
local recipes so the selection, unsaved preview, Recipe Book, and grocery-list
handoffs remain testable while scrape credits are unavailable
(`lib/data/temporary-discovery-demo.ts`, `components/discovery/discover-form.tsx`).

Standardized grocery-list card dimensions and truncation, fixed Recipe Book
search-icon spacing, and prevented silent duplicate recipe lists. Grocery lists
now retain bounded recipe provenance through additions and merges; trying to
create another list for the same recipe presents an explicit Yes/No confirmation.
The optional schema addition was deployed to development, and the full suite
passes 140 tests (`convex/schema.ts`, `convex/groceryLists.ts`,
`components/grocery/add-recipe-to-list-button.tsx`, `app/(app)/app/grocery-lists/`).

### 2026-09-18 - working tree
Added a reusable Firecrawl Agent request guard with a deployment-configurable
500-credit default and tests that reject unsafe ceilings. Added a separate
deployment flag that pauses automatic daily recommendation refreshes while
continuing to serve cached recommendations and leaving manual searches and link
imports available (`convex/lib/firecrawlAgent.ts`, `convex/lib/featureFlags.ts`,
`convex/recipeDiscovery.ts`, `convex/convex.config.ts`, `README.md`).

Refined active cooking and grocery-list flows. Declining the duplicate-list
confirmation now closes the dialog completely. The Home current-recipe card now
offers clear View, Change, and Clear actions; Change opens a dedicated Recipe
Book selection mode, updates the current recipe, and returns home after a
selection (`components/grocery/add-recipe-to-list-button.tsx`,
`components/recipes/current-recipe-panel.tsx`, `components/recipes/recipe-card.tsx`,
`app/(app)/app/recipe-book/page.tsx`).

Removed the temporary local discovery fixtures while keeping automatic daily
recommendation refreshes paused behind the existing deployment flag. Discover
now presents its production recommendations UI, shows an explicit scraping
spinner during manual search, applies the same scrape-failure messages to pasted
links, and no longer shows a redundant ready notification after navigation to a
completed recipe. Recipe detail actions are arranged as an equal two-column
grid with Save, Current, Grocery, and View original controls, and the Recipe
Book displays no more than three cards per desktop row
(`components/discovery/`, `components/recipes/recipe-preview-actions.tsx`,
`components/recipes/recipe-import-notifications.tsx`,
`app/(app)/app/recipe-book/page.tsx`).

Reworked email intake around one deployment-configured AgentMail inbox instead
of provisioning an inbox per user. Forwarded messages are associated with the
signed-in account by sender, recorded as bounded inbox history, and limited to
one plausible recipe page so footer and signature links cannot create duplicate
jobs. Direct and email imports now share individual-recipe URL checks and reuse
failed URL state, while per-email notifications collapse into one processing or
failure message. Successful inbox entries open the shared recipe preview with
Recipe Book, current-recipe, grocery-list, and source actions; failed entries
show a final download failure without a misleading review or recipe button
(`convex/email.ts`, `convex/recipeIngestion.ts`, `convex/lib/urls.ts`,
`convex/schema.ts`, `components/imports/email-intake.tsx`,
`components/recipes/recipe-preview-modal.tsx`).

Simplified the authenticated shell by moving Recipe Inbox into the main
navigation, removing the separate Workspace group and top bar, and placing Log
out directly above Settings in the desktop sidebar. Updated setup and feature
documentation to match the shared inbox, explicit-save recipe flow, paused
recommendations option, and current navigation (`components/app-shell/app-shell.tsx`,
`app/globals.css`, `README.md`).
