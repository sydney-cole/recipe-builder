# Hackathon log

- **Project:** PerfectPlate
- **Event:** Convex All Gas Hackathon
- **What it does:** Helps home cooks discover and import recipes, turn ingredients into a grocery list, and save personal recipe cards with notes.
- **Live app:** not deployed
- **Repo:** https://github.com/sydney-cole/recipe-builder
- **Frontend:** Convex static hosting
- **Convex deployment:** not deployed
- **Components:** none
- **Convex features:** schema, tables, indexes, full-text search, queries, HTTP actions
- **Auth:** Convex Auth
- **AI models:** Codex 5.6 Sol
- **Started:** 2026-09-01T21:12:33Z
- **Last updated:** 2026-09-02T19:26:10Z

## Log

### 2026-09-01 - d00fad0
Initialized the project repository with its recipe-builder README (`README.md`).

### 2026-09-02 - working tree
Designed the database for recipe URL imports, reusable recipe cards, normalized
ingredients, saved recipes, and grocery lists with recipe provenance. Added
Convex Auth with email/password authentication, its HTTP routes and tables, and
a current-user query. Convex features: schema, tables, indexes, full-text
search, queries, HTTP actions (`convex/schema.ts`, `convex/auth.ts`,
`convex/auth.config.ts`, `convex/http.ts`, `convex/users.ts`).
