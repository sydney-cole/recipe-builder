# Hackathon log

- **Project:** PerfectPlate
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps home cooks discover and import recipes, turn ingredients into a grocery list, and save personal recipe cards with notes.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** https://striped-meadowlark-868.convex.cloud (development)
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/agent, @convex-dev/workflow
- **Convex features:** schema, tables, indexes, full-text search, queries, realtime queries, mutations, actions, HTTP actions, registered components
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5-mini through the direct OpenAI API; Convex AI Gateway remains configurable for a future switch
- **Started:** 2026-09-01T21:12:33Z
- **Last updated:** 2026-09-10T21:24:32Z

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
