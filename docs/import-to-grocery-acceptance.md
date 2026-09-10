# Import-to-grocery acceptance record

Recorded September 8, 2026 for OpenSpec change `complete-import-to-grocery-journey`.

## Automated fixture results

- PASS — Password signup verification issuance, confirmation, invalid/expired handling, and shared-inbox eligibility transition (`components/auth/auth-form.test.tsx`, `convex/lib/verification.test.ts`).
- PASS — Direct URL normalization/deduplication and verified-sender shared-inbox routing, including replay, unknown, unverified, ambiguous, and wrong-inbox cases (`convex/functions.test.ts`, `convex/lib/agentmail.test.ts`).
- PASS — Firecrawl document and OpenAI Responses fixtures for useful content, unsupported/no-content pages, hostile embedded instructions, refusal, incomplete/invalid output, rate limits, transient failures, and absent configuration (`convex/lib/importPipeline.test.ts`).
- PASS — One authenticated fixture moves through retrieval/generation states, generated-draft review and correction, atomic save, Recipe Book membership, ingredient selection, serving scaling, list persistence, and source provenance (`convex/journey.test.ts`).
- PASS — Failure/retry/stale-attempt behavior and safe public lifecycle fields (`convex/functions.test.ts`).
- PASS — Desktop interaction semantics for dashboard, imports, review, Recipe Book, recipe-to-list dialog, grocery overview, and grocery editor (colocated Testing Library tests).
- PASS — Narrow-layout implementation review: the page prevents horizontal overflow; grocery controls reflow below 520px; item inputs, checkboxes, and primary buttons have 44px minimum targets; controls have programmatic names, visible focus, logical DOM order, and live status announcements (`app/globals.css`, `components/grocery/grocery-list-editor.tsx`).

## Quality evidence

- `npm run check`: passed with 28 test files and 84 tests.
- `npm run build`: passed; review, Recipe Book detail, grocery overview, and grocery detail routes were emitted as dynamic server-rendered routes.
- Provider credentials were not needed for fixture tests and were not printed or persisted.

This record covers fixture-backed acceptance. A deployment smoke test with real provider credentials is still recommended after configuring a non-production Convex deployment.
