# Hackathon log

- **Project:** PerfectPlate
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps home cooks discover and import recipes, turn ingredients into a grocery list, and save personal recipe cards with notes.
- **Live app:** not deployed
- **Repo:** https://github.com/sydney-cole/recipe-builder
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** none
- **Convex features:** schema, tables, indexes, full-text search, queries, HTTP actions
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-09-01T21:12:33Z
- **Last updated:** 2026-09-03T21:41:59Z

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

### 2026-09-03 - working tree
Built the responsive PerfectPlate frontend scaffold with landing and auth
screens, recipe discovery, Recipe Book, recipe import states, food-blog
subscriptions, editable grocery lists, settings, and reusable UI states. The
flows use isolated mock data until Convex and AgentMail are connected
(`app/`, `components/`, `lib/data/mock-data.ts`, `DESIGN.md`, `README.md`).
