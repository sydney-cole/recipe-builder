# PerfectPlate

PerfectPlate turns recipe links into a reviewed personal Recipe Book and persistent grocery lists. The application uses Next.js, Convex Auth, a single site-wide AgentMail inbox, Firecrawl page retrieval, and OpenAI Responses API Structured Outputs.

## Local setup

Prerequisites are Node.js 20 or newer, npm, and a Convex development deployment.

```sh
npm install
npx convex dev
```

In a second terminal:

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` and supply only the public Convex values shown there. Provider secrets belong in the Convex deployment environment, never `.env.local`, source control, or `NEXT_PUBLIC_*` variables.

## Import provider configuration

Configure these server-only Convex variables for each deployment:

```sh
npx convex env set AGENTMAIL_API_KEY
npx convex env set AGENTMAIL_WEBHOOK_SECRET
npx convex env set AGENTMAIL_INBOX_ID
npx convex env set AGENTMAIL_INBOX_EMAIL
npx convex env set FIRECRAWL_API_KEY
npx convex env set OPENAI_API_KEY
npx convex env set OPENAI_RECIPE_MODEL
```

`AGENTMAIL_INBOX_ID` and `AGENTMAIL_INBOX_EMAIL` identify one inbox shared by the entire site. Register `https://<your-convex-site>/agentmail/webhook` in AgentMail. The app does not provision an inbox per user. An inbound message is routed only when its normalized From address matches exactly one verified account email. Direct URL paste remains available to every authenticated user and does not require verified email.

Firecrawl retrieves one recipe page as bounded main-content Markdown. That content and minimal source metadata are passed server-to-server to the OpenAI Responses API. `OPENAI_RECIPE_MODEL` deliberately keeps model selection in deployment configuration. The prompt and strict Structured Outputs schema are versioned in `convex/lib/validation.ts`; generation uses no tools and disables provider storage. Page content is treated as untrusted data, and the prompt instructs the model not to invent missing values.

The generated draft is not a saved recipe. The owner must compare it with the original source, correct it, and explicitly save. Temporary failures expose safe categories and may be retried once per newly claimed attempt; stale workers cannot overwrite a newer attempt.

### Data-retention boundary

PerfectPlate persists normalized recipe fields, bounded source metadata, model/prompt/schema identifiers, safe import errors, and grocery provenance. Public queries do not return raw scraped pages, raw model responses, webhook payloads, sender addresses, credentials, or internal provider errors. AgentMail message/thread content stays in the isolated AgentMail component.

## Account verification

Password signup sends a short verification code through the configured shared AgentMail inbox. Shared-inbox import eligibility begins only after the account email is verified. Invalid and expired codes fail without revealing account-enumeration details.

## Grocery planning

Saved recipes can add all or selected ingredients to an existing or newly created list. Quantities scale by servings. Items merge only when normalized identity and units match and both quantities are calculable; incompatible or textual quantities stay separate. A request key prevents accidental resubmission, while a later deliberate addition remains possible. Each contribution retains a recipe link and quantity provenance.

List names, item edits, checkoffs, completion/archive state, and removals persist in Convex. Removal has a 30-second undo window, after which cleanup deletes the item and its provenance.

## Migration from per-user inboxes

After deploying this schema, run the idempotent reconciliation once per deployment:

```sh
npx convex run migrations:reconcileImportJourney
```

It backfills missing saved-recipe relationships for completed owned imports, removes obsolete per-user inbox mappings, and schedules queued imports. Re-running it does not duplicate saved relationships or import attempts and does not delete recipes or imports. The legacy table remains temporarily in the schema only to permit a safe rollout.

## Tests and quality gates

Provider behavior is tested with local fixtures and mocked SDK responses, so automated tests require no live Firecrawl, OpenAI, or AgentMail credentials.

```sh
npm test
npm run check
npm run build
```

`npm run check` runs TypeScript, ESLint, and the complete Vitest suite. Convex tests cover authentication and cross-user boundaries; Testing Library covers progress, review, collection, and grocery interactions.
