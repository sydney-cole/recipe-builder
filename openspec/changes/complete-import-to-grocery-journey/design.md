## Context

See `proposal.md` for motivation and the four capability specs for required behavior.

The current application already has authenticated URL and AgentMail intake, normalized per-user deduplication, an import status model (`queued`, `scraping`, `parsed`, `completed`, `failed`), canonical recipe and ingredient tables, saved-recipe relationships, and grocery-list tables with source provenance. AgentMail is currently modeled as though an inbox is connected to an individual user, but the intended product has one inbox for the whole site. Imports are only inserted as `queued`; no application action retrieves the source with Firecrawl, generates a recipe draft with OpenAI, or advances the import. Generated content has no draft storage or review route. Recipe queries include every public recipe whether or not the user saved it, and grocery pages use component-local mock data despite the existing schema.

The change crosses Convex actions, mutations, queries, external source retrieval and model generation, authenticated Next.js routes, and several user-visible state transitions. Provider credentials and webhook payloads must remain server-side, paid provider calls must follow an authenticated URL submission or a safely assigned shared-inbox message, and repeated webhooks or UI submissions must remain idempotent.

## Goals / Non-Goals

**Goals:**

- Use one import state machine for pasted URLs and links received at the verified site-wide AgentMail inbox.
- Assign shared-inbox messages only by an exact normalized match to one verified PerfectPlate account email.
- Generate bounded, source-grounded recipe drafts from Firecrawl content with OpenAI and require review before persistence as a canonical recipe.
- Preserve unapproved generated output separately from canonical saved recipes.
- Make every core-journey action durable, user-owned, recoverable, and accurately represented in the interface.
- Reuse the existing recipe, ingredient, grocery-list, and provenance model where its semantics already fit.
- Keep the narrow mobile grocery experience usable without designing a separate mobile application.

**Non-Goals:**

- General web recipe discovery, recommendation ranking, AI conversational search, or AI-authored recipes unsupported by an imported source.
- Automated food-blog enrollment or subscription management.
- Grocery-list sharing, real-time collaboration, notifications, offline mutation queues, or unit conversion beyond explicitly supported compatible units.
- Replacing Convex Auth, AgentMail, Firecrawl, or the existing design system.
- Preserving mock dashboard, subscription, discovery, or grocery data as user data.

## Decisions

### 1. Converge direct URLs and one shared inbox on one scheduled import processor

Direct URL submission and verified AgentMail ingestion will call a shared internal enqueue operation. There is exactly one configured AgentMail inbox for the site; the application does not provision, store, or connect one inbox per user. The authenticated UI treats URL paste as the primary action and may show the shared address as an optional way to forward recipe links or newsletters the user has received. Directly subscribing the shared inbox to a newsletter cannot establish which user owns a resulting link, so those messages are not assigned unless a future routing mechanism provides an equally strong user association.

The AgentMail webhook first verifies the event and configured inbox identity, normalizes the mailbox in `message.from`, and resolves it to exactly one verified PerfectPlate account email. That account becomes `requestedBy`. Unknown, unverified, or ambiguous senders are recorded only with a safe internal disposition and create no user-owned import. This routing requires account-email verification to exist before email intake is enabled; ownership is never inferred from message content, recipient aliases, or an unverified address.

A successful insert schedules an internal processing action and returns immediately so the UI can subscribe to the new import. The processor claims one eligible attempt, changes the status to `scraping`, retrieves source content, generates a structured draft, then writes either a validated review draft and `parsed` status or a categorized failure and `failed` status.

The claim includes the attempt number. Completion mutations accept that attempt number and ignore stale action results, preventing an earlier timed-out extraction from overwriting a later retry. Retry is an authenticated mutation that checks ownership, retry eligibility, and current terminal state before incrementing the attempt and scheduling exactly one processor.

Alternative considered: provision an AgentMail inbox for every user. That does not match the intended product, adds inbox lifecycle and mapping state, and makes newsletter enrollment harder to explain. The shared address plus verified-sender routing keeps email as a lightweight capture channel while URL paste remains the clearest default.

### 2. Retrieve with Firecrawl, then generate a strict recipe draft with OpenAI

Each import represents one recipe page, so the processor will use the registered Firecrawl component's one-shot `scrape` operation to retrieve clean main content plus canonical source metadata. Durable multi-page crawl tracking is unnecessary for one URL and would add webhook and progress concepts that do not improve this journey.

The processor will then call the OpenAI Responses API with Structured Outputs using a strict JSON schema that matches the bounded recipe-draft shape. The system prompt will define retrieved content as untrusted source data, instruct the model to ignore directions embedded in that content, prohibit guessing, and require absent optional values to remain absent or null. The model receives only the recipe source content and minimal source metadata—not user email data, unrelated message text, provider credentials, or other account data. Structured output controls shape; application validation still enforces field lengths, collection limits, acceptable values, and the minimum content required for review.

OpenAI model selection is server-side configuration rather than a client choice or a hard-coded claim about the latest model. Each successful draft records minimal generation provenance needed for debugging and reproducibility: model id, prompt/schema version, generation time, and a provider response/request identifier when available. Raw retrieved pages and model responses are not exposed to clients and are retained only as long as operationally necessary. The OpenAI request should disable provider-side response storage when supported by the selected API configuration.

Firecrawl and OpenAI errors are mapped server-side by stage into stable categories such as invalid/unsupported page, no recipe found, temporary provider failure, rate limit, model refusal or incomplete response, invalid bounded output, and configuration failure. Only safe messages and retry eligibility reach the client; diagnostic details stay in server logs. A schema-valid result is not assumed to be factually correct, so the original source and mandatory human review remain the final quality boundary.

Alternative considered: ask Firecrawl to return the final recipe JSON directly. Separating retrieval from recipe generation makes the AI transformation explicit, gives the application control over its schema and prompt versions, and allows provider-stage failures and quality to be measured independently.

### 3. Store review-ready content in a separate import draft

Add a `recipeImportDrafts` table keyed uniquely by `importId`. It will hold editable recipe-shaped fields and ordered ingredient/instruction arrays produced by OpenAI plus minimal source/generation provenance. It will not be returned by Recipe Book queries and is readable or writable only through functions that confirm ownership through the parent import.

The canonical `recipes` and `recipeIngredients` rows will be created only when the user confirms review. This prevents incomplete or incorrect generation from appearing as saved content and makes an atomic save straightforward. Review edits remain client-side until save; navigating away with changes triggers a discard warning, while reopening restores the original persisted generated draft.

Alternative considered: create a canonical recipe immediately with a `draft` flag. That would add draft filtering to every recipe query and create more opportunities for unreviewed content to leak into the Recipe Book.

### 4. Save reviewed content in one authenticated Convex mutation

The review-save mutation will validate ownership, `parsed` status, required content, and normalized field bounds. In one Convex transaction it creates or updates the canonical recipe, replaces its ordered ingredient rows, creates the user's `savedRecipes` relationship if absent, records the recipe id on the import, and sets the import to `completed`. If the import is already completed, the mutation returns the existing accessible recipe, making repeat submissions idempotent.

The original normalized source URL remains authoritative and is not editable during review. User corrections apply to recipe content only. Optional extraction values remain optional rather than receiving invented zeroes or placeholder text.

Alternative considered: save each review section independently. That would support server-side drafts but creates partial-save states without enough v1 value to justify them.

### 5. Define the Recipe Book strictly through saved relationships

Recipe Book list and search queries will use `savedRecipes` for collection membership and then load accessible canonical recipes. Completed import review always creates that relationship. Public visibility continues to permit safe recipe-detail access where explicitly linked, but it no longer causes every public seed recipe to appear in every user's personal collection.

Dashboard counts, recent recipes, and import-attention summaries will come from authenticated Convex queries over the same saved and import records. New users get a real empty state centered on import. Discover and Subscriptions remain navigable previews, but their controls will be disabled or replaced with explanatory preview calls to action so local mutations cannot be mistaken for account persistence.

Alternative considered: keep public recipes in Recipe Book as starter content. This conflicts with the meaning of a personal collection and makes empty-state onboarding impossible to evaluate honestly.

### 6. Add an explicit recipe-to-list planning dialog

The recipe detail action opens an accessible dialog containing ingredient checkboxes, a select-all control, the current serving count, and a target-list selector with inline list creation. All ingredients begin selected; users can omit pantry items before confirming. The confirmation calls one authenticated mutation with the recipe id, target list id, selected ingredient ids, serving multiplier, and a client-generated request key.

The server independently verifies recipe access, list ownership, and ingredient membership. It derives names and base quantities from stored recipe ingredients rather than trusting client-provided content. The request key makes repeated confirmation safe across network retries.

Alternative considered: navigate directly to a list and add every ingredient. That obscures which list was changed and removes the high-value chance to exclude ingredients already on hand.

### 7. Merge only structurally compatible grocery items

For each selected ingredient, the server normalizes the name and searches unchecked items on the target list. It merges quantities only when both values are numeric and units are identical after conservative normalization, or when both are unitless. Otherwise it creates a separate readable item. Every addition writes a `groceryListItemSources` row with the recipe ingredient, recipe, serving multiplier, and contributed quantity/text.

A small `groceryListAdditions` record keyed by list and request key will record a completed batch so retried requests return the existing result without adding quantities twice. This is separate from semantic duplicate detection: users may intentionally add the same recipe again in a later planning session using a new request key.

Alternative considered: convert common units automatically. Conversion rules, density-dependent ingredients, and fractional display require a separate product decision; incorrect grocery quantities are worse than two understandable rows.

### 8. Persist grocery editing with mutation-specific interaction patterns

Add authenticated queries for a user's lists and one owned list, plus mutations for list lifecycle and item add, edit, check, remove, and undo. Checkbox and removal actions can update optimistically because they have compact inverse state. Text and quantity fields keep a local editing draft and commit on blur or Enter; a failed commit retains the user's typed value, marks it unsaved, and offers retry instead of silently reverting.

Removal will be soft during a bounded undo window by recording removal metadata rather than immediately deleting the item and its sources. After the undo window, a scheduled internal mutation may permanently remove the item and provenance. Layout changes will stack name and quantity controls at narrow widths, keep primary controls at least 44 pixels high, and announce mutation results through status or alert regions.

Alternative considered: save on every keystroke. That increases mutation volume, complicates error recovery, and makes temporary invalid text look like confirmed data.

### 9. Keep authorization at every application boundary

Public actions and mutations will derive the authenticated user on the server. Internal processing functions receive ids only from trusted application mutations or verified AgentMail webhook handlers. Import access joins through `requestedBy`; review drafts join through their import; grocery items and provenance join through an owned list. Not-found and not-owned cases return the same safe absence behavior where revealing existence would leak data.

External URLs remain subject to the existing URL normalization and safety checks before queuing or retrieval. AgentMail signature verification, the single configured inbox id, and Firecrawl and OpenAI credentials remain in server configuration. Shared-inbox routing resolves only against verified account emails and returns no account-existence signal to rejected senders. No raw provider response is returned to clients.

Alternative considered: rely on protected Next.js routes for ownership. Route protection authenticates page access but cannot secure direct Convex function calls, so server-side checks remain mandatory.

## Risks / Trade-offs

- **[The model omits, invents, or misclassifies recipe content]** -> Ground the prompt in retrieved content, prohibit guessing, retain the original source link, validate bounded output, and require human review before save.
- **[A recipe page contains prompt-injection text]** -> Delimit the page as untrusted data, instruct the model to ignore embedded directions, expose no tools or secrets to generation, enforce the recipe schema, and validate the result in application code.
- **[A shared-inbox sender is spoofed or misassigned]** -> Verify AgentMail webhooks, require an exact unique match to a verified account email, accept events only for the configured inbox, and create no user-owned data when resolution is unsafe.
- **[OpenAI adds latency or cost to every import]** -> Process asynchronously, bound input and output sizes, pin server-side model configuration, record minimal usage/provenance, deduplicate before provider calls, and retry only eligible failures.
- **[Actions finish out of order after retry]** -> Attach the attempt number to claims and completion writes and ignore stale results.
- **[Duplicate quantities are added after a client retry]** -> Require a per-confirmation request key and persist completed addition batches.
- **[Existing public seed recipes disappear from user collections]** -> Treat this as intentional collection semantics, backfill saved relationships only where existing imports or saved records demonstrate ownership, and provide a clear import-first empty state.
- **[Soft removal adds cleanup complexity]** -> Keep the undo window short, make cleanup idempotent, and exclude removed items from normal queries immediately.
- **[Large recipes exceed practical review or mutation payloads]** -> Bound ingredient and instruction counts and field lengths during extraction validation while preserving a safe failure message and original-source link.
- **[Provider configuration is absent in a development deployment]** -> Surface an environment-specific unavailable state without exposing secret names to ordinary users; document server-only AgentMail, Firecrawl, and OpenAI configuration for developers.
- **[Preview navigation distracts from the v1 path]** -> Label preview destinations consistently and make import, Recipe Book, and Grocery the only functional primary journey actions.

## Migration Plan

1. Add the import-draft and grocery-addition tables, retry/error and source/generation provenance metadata, soft-removal fields, and required indexes as additive schema changes.
2. Add server-only OpenAI configuration and the versioned prompt/schema, then deploy the Firecrawl retrieval and OpenAI generation processor behind tests before exposing new routes or buttons. Existing clients continue to see current import statuses during this step.
3. Replace per-user AgentMail inbox mapping and connection behavior with one configured site inbox and verified-sender resolution. Enable email-originated imports only after account-email verification is available; retire obsolete per-user inbox records without deleting imports already owned by a user.
4. Run an idempotent migration that creates missing `savedRecipes` relationships for existing completed imports with a recipe id. Do not automatically save unrelated public seed recipes.
5. Schedule processing for eligible existing `queued` imports once, using the same claim rules as new imports. Leave existing failed imports failed until the owner retries.
6. Release the review route, import actions, saved-only Recipe Book query, real dashboard states, recipe-to-list dialog, and persistent grocery pages together so no new CTA ends at a dead end.
7. Replace local mock interactions in the core journey and label Discover and Subscriptions as previews. Mock fixtures remain available to tests but no longer represent authenticated account state.
8. Verify verified-sender ownership isolation, webhook idempotency, Firecrawl and OpenAI failure recovery, source grounding, review atomicity, addition idempotency, narrow-screen grocery use, `npm run check`, and `npm run build`.

Rollback will first restore the previous UI routes and stop scheduling new processors. The additive tables and fields can remain deployed safely. The migration is not reversed because it only makes existing import ownership explicit through saved relationships; no user recipe data is deleted.
