## 1. Data Model and Shared Validation

- [ ] 1.1 Extend the Convex schema with `recipeImportDrafts`, import attempt/error and source/generation provenance metadata, `groceryListAdditions`, and soft-removal fields and indexes; verify generated Convex types and `npm run typecheck` succeed.
- [ ] 1.2 Add bounded validators and normalization helpers for OpenAI recipe drafts, source metadata, generation provenance, retry categories, normalized sender addresses, grocery units, and editable list fields; verify focused unit tests cover valid, missing, malformed, and oversized values.
- [ ] 1.3 Add reusable authorization helpers for owned imports, review drafts, lists, and list items plus a resolver requiring one exact verified account-email match for shared-inbox senders; verify `convex-test` cases deny unauthenticated, unverified, ambiguous, and cross-user access.
- [ ] 1.4 Implement or configure account-email verification as a prerequisite for shared-inbox routing, without blocking authenticated direct URL imports; verify tests cover verification issuance/confirmation, expired or invalid verification, and the intake eligibility transition.

## 2. Import Processing Lifecycle

- [ ] 2.1 Refactor direct URL and AgentMail intake to use one idempotent enqueue path, one configured site-wide inbox, and no per-user inbox provisioning; verify tests cover normalized duplicate URLs, the configured inbox id, and replayed webhook events.
- [ ] 2.2 Implement verified AgentMail sender routing by normalized `message.from`, assigning an import only for one exact verified account-email match; verify tests cover valid routing, unknown and unverified senders, ambiguous matches, wrong-inbox events, invalid signatures, and absence of account-enumeration details.
- [ ] 2.3 Implement attempt-number claims and guarded import status transitions for queued, scraping, parsed, completed, and failed states, with safe distinctions between source-retrieval and draft-generation progress; verify tests prove concurrent or stale attempts cannot overwrite the current attempt.
- [ ] 2.4 Implement the internal Firecrawl one-page retrieval action for clean main content and canonical source metadata, including input/output bounds and server-side error categorization; verify action tests with mocked success, unsupported page, no useful content, transient failure, rate limit, and invalid provider responses.
- [ ] 2.5 Add the server-only OpenAI SDK/configuration and a versioned prompt plus strict Structured Outputs JSON schema for the bounded recipe-draft shape; verify configuration tests fail safely when credentials or model configuration are absent and confirm no secret or server configuration enters a client bundle.
- [ ] 2.6 Implement the OpenAI Responses API generation action using only retrieved recipe content and minimal source metadata, with provider storage disabled when supported, no tools, explicit untrusted-content boundaries, no guessing, and null/absent optional values; verify mocked tests cover grounded success, embedded prompt instructions, refusal, incomplete response, invalid bounds, rate limit, and transient provider failure.
- [ ] 2.7 Persist successful generation into one owned import draft with minimal source/model/prompt/schema/request provenance and persist only safe categorized failure metadata on error; verify tests show raw page content, model responses, webhook payloads, and internal details are never returned by public queries.
- [ ] 2.8 Implement the authenticated retry mutation with ownership, state, and retryability checks and exactly-once scheduling per attempt; verify tests cover permitted Firecrawl and OpenAI retries, terminal failure, duplicate clicks, and cross-user denial.
- [ ] 2.9 Expand import queries to return safe lifecycle details and review destinations reactively; verify `convex-test` cases cover each processing stage, terminal status, and ownership boundary.

## 3. Import and First-Run Interface

- [ ] 3.1 Update recent-import UI states with explicit waiting, source retrieval, draft generation, review-ready, saved, and failed treatments plus working review and retry actions; verify Testing Library tests cover labels, disabled pending actions, safe errors, and navigation.
- [ ] 3.2 Replace fictional authenticated dashboard counts and recent activity with persisted recipe/import summaries and an import-first empty state; verify component tests cover new, processing, attention-needed, and populated accounts.
- [ ] 3.3 Mark Discover and Subscriptions consistently as previews and remove or disable controls that imply account persistence; verify tests show preview messaging and no local add/save/manage success state.
- [ ] 3.4 Keep URL paste as the primary intake action and replace per-user inbox connection UI with the shared site address, verified-email eligibility guidance, and copy feedback; verify tests cover eligible and ineligible accounts, absence of provisioning controls, direct URL states, and duplicate submission returning the existing import.

## 4. Recipe Review and Save

- [ ] 4.1 Add an authenticated review query that returns the owned import, safe current state, original source, and persisted OpenAI-generated draft; verify tests cover parsed, processing, failed, completed, missing, and cross-user imports without exposing raw provider data.
- [ ] 4.2 Implement the atomic idempotent review-save mutation that validates content, creates canonical recipe and ingredient rows, creates the saved relationship, and completes the import; verify tests cover correction persistence, optional fields, invalid reviews, repeated submits, and rollback on validation failure.
- [ ] 4.3 Create the authenticated import review route and editable form for generated recipe metadata, ingredients, and ordered instructions with an explicit review notice, inline validation, and original-source attribution; verify Testing Library tests cover correcting unsupported output, editing, adding, removing, reordering, validation focus, and successful navigation to the saved recipe.
- [ ] 4.4 Add unsaved-change detection and confirmed discard behavior to recipe review; verify navigation tests cover untouched forms, cancelled navigation, confirmed discard, and reopening the persisted generated draft.
- [ ] 4.5 Add processing, failed, and already-completed route states so non-ready imports never render as editable drafts; verify each state has an appropriate safe action and inaccessible imports reveal no content.

## 5. Trustworthy Recipe Book

- [ ] 5.1 Change Recipe Book membership to use the authenticated user's saved relationships rather than all public recipes; verify query tests cover imported, explicitly saved, unrelated public, private cross-user, and duplicate relationship cases.
- [ ] 5.2 Extend collection search and sorting over saved recipe data while preserving recent, quickest, and title ordering; verify domain and query tests cover missing times, case-insensitive terms, and stable membership.
- [ ] 5.3 Add distinct collection loading, empty, no-results, populated, and recoverable failure UI states with an import action; verify page tests assert each state and that no mock recipes or counts appear.
- [ ] 5.4 Keep recipe detail access, source links, and serving scaling aligned with saved content and expose the grocery-planning action only for accessible recipes; verify existing serving tests plus missing and cross-user detail tests pass.

## 6. Persistent Grocery Backend

- [ ] 6.1 Implement authenticated list collection and detail queries plus create, rename, complete, and archive mutations; verify `convex-test` coverage for empty/populated states, validation, persistence, and cross-user isolation.
- [ ] 6.2 Implement one-off item creation and confirmed item edit/check mutations with ownership checks and stable ordering; verify tests cover names, numeric and textual quantities, units, notes, check state, invalid values, and refresh persistence.
- [ ] 6.3 Implement soft removal, bounded undo, filtered reads, and idempotent cleanup of expired removals while preserving provenance during the undo window; verify tests cover remove, undo, expiry, repeated actions, and cross-user denial.
- [ ] 6.4 Implement the idempotent recipe-to-list mutation using request keys, server-derived ingredient data, serving multipliers, conservative compatible-unit merging, and separate rows for incompatible units; verify tests cover full/subset selection, no selection, repeated requests, deliberate later additions, and inaccessible recipe/list ids.
- [ ] 6.5 Return recipe-source provenance with list items, including each source's contribution and safe recipe destination; verify tests cover one source, merged multiple sources, removed sources, and inaccessible recipes.

## 7. Grocery Planning and Shopping Interface

- [ ] 7.1 Replace the mock grocery overview with persisted list queries, honest loading/error/empty states, and working create/rename/complete/archive actions; verify page tests and a refresh-level integration test demonstrate durable list state.
- [ ] 7.2 Build the accessible recipe-to-list dialog with default-all ingredient selection, serving controls, target-list selection, inline list creation, empty-selection validation, request-key reuse, and destination confirmation; verify interaction tests cover keyboard use, subsets, retries, and duplicate-submit protection.
- [ ] 7.3 Replace the local grocery editor with persisted add/edit/check/remove/undo operations, optimistic state only where safely reversible, and visible unsaved/retry feedback for failed text edits; verify interaction tests cover success, rollback, retained drafts, undo, remaining counts, and provenance links.
- [ ] 7.4 Adapt grocery rows and controls for narrow screens with no horizontal page scrolling, at least 44-pixel primary touch targets, logical focus order, programmatic names, and announced status updates; verify automated accessibility assertions and manual checks at representative mobile widths.

## 8. Migration, Documentation, and End-to-End Verification

- [ ] 8.1 Add an idempotent migration for missing saved relationships on completed imports, retire obsolete per-user inbox mapping data without changing existing import ownership, and add a one-time scheduler for eligible queued imports; verify rerunning the operations makes no duplicate records or processing attempts and deletes no owned recipes or imports.
- [ ] 8.2 Update developer documentation for the shared AgentMail inbox, account-email verification prerequisite, Firecrawl retrieval, OpenAI Responses API and `OPENAI_API_KEY`, server-side model configuration, versioned prompt/schema, review flow, retry behavior, data-retention boundary, and local mocked-provider testing without including secret values; verify a clean setup can follow the documented commands.
- [ ] 8.3 Run the complete automated quality suite with `npm run check` and resolve all failures; verify the command exits successfully with the new focused test coverage included.
- [ ] 8.4 Run `npm run build` and verify the production build succeeds without route, server/client boundary, or generated Convex type errors.
- [ ] 8.5 Exercise the full authenticated import-to-grocery journey with Firecrawl and OpenAI provider fixtures on desktop and mobile—signup and email verification, URL import, verified-sender shared-inbox import, progress, generated-draft review and correction, save, ingredient selection, list persistence, checkoff, failure, and retry—and record the observed acceptance results.
