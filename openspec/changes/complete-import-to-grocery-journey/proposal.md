## Why

PerfectPlate currently presents a broad recipe-planning product, but its most valuable journey stops after a recipe URL is queued: users cannot reliably follow extraction, review the result, save it, and turn selected ingredients into a persistent shopping list. Completing that journey will give new users one honest, useful path from recipe inspiration to shopping instead of a collection of disconnected previews.

## What Changes

- Make recipe import the primary first-run action after account creation, with URL paste as the main path and a shared site-wide AgentMail address as an optional path for forwarding recipe links or newsletters the user received.
- Route messages from the shared inbox to exactly one account by normalized, verified sender email; unknown, unverified, or ambiguous senders create no user-owned imports, and users never provision or connect individual inboxes.
- Complete the authenticated import lifecycle from queued source retrieval through OpenAI-generated draft creation, progress, actionable failure and retry, and a review-ready result.
- Use Firecrawl to retrieve recipe-page content and the OpenAI Responses API with Structured Outputs to create a source-grounded recipe draft; require human review before any draft enters the Recipe Book.
- Add a review step where users can correct generated recipe-draft details before saving the recipe to their Recipe Book.
- Make the Recipe Book reflect only persisted user-accessible recipes and connect saved recipes to their review and grocery-list actions.
- Let users select recipe ingredients, choose or create a grocery list, merge compatible items, and retain recipe-source context.
- Persist grocery-list creation, edits, completion state, and item removal so the list works across navigation and refreshes, including while shopping on mobile.
- Replace fictional authenticated dashboard activity with real data and journey-appropriate empty states and calls to action.
- Keep Discover and Subscriptions visible only as clearly labeled previews; their backend implementation, sharing, notification preferences, and advanced filters are non-goals for this change.

## Capabilities

### New Capabilities

- `recipe-import-lifecycle`: Authenticated URL intake, shared-inbox email intake, source retrieval, OpenAI draft generation, observable progress, recoverable failures, retry, and transition to recipe review.
- `recipe-review`: User verification and correction of source-grounded, AI-generated recipe content before it is saved.
- `recipe-book`: Persisted recipe collection, honest collection states, recipe details, and onward actions into grocery planning.
- `grocery-list-planning`: Persistent list creation and editing, ingredient selection and aggregation, source provenance, and mobile shopping behavior.

### Modified Capabilities

None. The project does not yet contain source-of-truth OpenSpec capability specs.

## Impact

- **Convex:** recipe-import processing actions and status transitions; shared-inbox sender routing; authenticated recipe mutations; grocery-list queries and mutations; authorization checks; indexes or schema adjustments needed for review drafts, retry and AI provenance metadata, and deterministic item aggregation.
- **Integrations:** Firecrawl retrieves clean content for queued URLs, OpenAI generates schema-constrained recipe drafts, and one AgentMail inbox receives site-wide forwarded links and emails. Provider credentials, raw webhook payloads, and provider diagnostics remain server-side.
- **Account security:** email-originated imports require a uniquely matched, verified PerfectPlate account email; messages from unknown, unverified, or ambiguous senders are not assigned to a user.
- **Configuration:** server-only Firecrawl, AgentMail, and OpenAI credentials are required, including `OPENAI_API_KEY`; no secret value is committed or exposed to the client.
- **Next.js UI:** post-signup/home empty states, imports and review routes, Recipe Book pages, recipe actions, grocery-list pages, navigation labels, and preview treatment for Discover and Subscriptions.
- **Current data boundary:** imports and the Recipe Book are partially Convex-backed; the dashboard, discovery, subscriptions, and grocery-list UI currently use mock or local component state. This change replaces mock/local state only where required by the core import-to-grocery journey.
- **Quality:** focused Vitest, Testing Library, and `convex-test` coverage plus full `npm run check` and `npm run build` verification.
