# PerfectPlate

PerfectPlate is an email-powered recipe organizer and meal-planning application.
The application uses Next.js, TypeScript, Tailwind CSS, and shadcn-style UI
components with Convex for authentication, realtime data, durable recipe
ingestion, and grocery-list workflows. The app scrapes pasted or emailed
recipe links directly, a language model (Anthropic, OpenAI, or OpenRouter)
structures recipe cards, and AgentMail receives recipes forwarded to a shared
inbox.

The frontend is hosted on Vercel at
[perfectplate.vercel.app](https://perfectplate.vercel.app/); Convex remains the
production database and application backend. See [Deployment](#deployment).

## Run the code locally

### Prerequisites

- Node.js 22 or newer
- npm

After cloning or pulling the repository, install the dependencies:

```sh
npm install
```

Start the Next.js development server:

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The development
server supports hot reload, so saved frontend changes should appear without
restarting it.

The authenticated application and Recipe Book require Convex. Open a second
terminal in the project root and run:

```sh
npx convex dev
```

Keep both terminals running during full-stack development:

1. `npm run dev` serves the frontend at `http://localhost:3000`.
2. `npx convex dev` watches and deploys Convex backend changes to the configured
   development deployment.

### Quality checks

Before sharing changes, run:

```sh
npm run typecheck
npm run lint
npm run build
```

### Tests

The test suite uses Vitest, Testing Library, and `convex-test`. It covers pure
domain logic, interactive React behavior, and authenticated Convex data access.

```sh
npm test                 # one complete run
npm run test:watch       # rerun affected tests while developing
npm run test:coverage    # text and HTML coverage reports
npm run check            # typecheck, lint, and tests
```

Keep tests beside the module they exercise using `*.test.ts` or `*.test.tsx`.
Every bug fix should include a regression test, and new Convex functions should
cover both authorized and unauthorized callers. Generated coverage output is
written to `coverage/` and should not be committed. The GitHub Actions CI
workflow runs checks, coverage floors, and a production build on pushes and
pull requests.

## Frontend features currently supported

The frontend currently includes the following responsive, navigable flows:

- **Marketing and authentication:** landing page plus working password-based
  sign-in, sign-up, and password-recovery screens backed by Convex Auth 2.0.
  Sign-up asks only for an email address and a password (the name can be set
  later in Settings); the account starts once its owner opens the confirmation
  link emailed to them. Password recovery also works through an emailed link.
  Links only work in the browser that requested them and expire; to get a new
  confirmation link, sign up again with the same address. Application routes
  require an authenticated session.
- **Application shell:** responsive desktop sidebar and five-item mobile bottom
  navigation. Recipe Inbox lives with the primary destinations; Log out and
  Settings are grouped at the bottom of the desktop sidebar.
- **Dashboard:** quick access to Discover, the shared Recipe Inbox, grocery
  lists, recent recipes, and a current recipe that can be viewed, changed, or
  cleared.
- **Recipe Book:** Convex-backed, searchable and sortable recipe gallery with
  favorites, a tag filter, a three-column desktop layout, detailed recipe
  pages, and a selection mode for changing the current recipe. The book lists
  the 500 most recently saved recipes and says so when that limit is reached.
- **Weekly planner:** plan breakfast, lunch, and dinner a week at a time,
  choosing which meals to plan and the day the week starts. Each meal is Cook,
  Leftovers, Eat out, or Skip. A Cook meal can use a saved recipe, a new recipe
  created from the typed name, or a recipe imported from a pasted link; a
  recipe with no ingredients yet can be filled in later from a web link. A
  week can be copied from an earlier one, and the last change can be undone.
  Home shows today's planned meals. The planner builds one grocery list per
  week from its Cook meals, scaled to the number of people and the leftovers
  each meal covers, and can update that list when the plan changes while
  keeping items added or edited by hand.
- **Recipe details:** ingredients, cooking instructions, serving controls that
  show kitchen fractions and carry the chosen serving count into a grocery
  list, source attribution, favorites, save/current/grocery/source actions,
  and duplicate-grocery-list confirmation. Personal notes and favorites are
  available once a recipe is in the Recipe Book. Editing and removal are
  offered only to the account that imported or created the recipe; anyone else
  can remove it from their own book.
- **Recipe importing:** authenticated users can search the web for recipes or
  paste recipe links on Discover, or forward recipe emails to one configured AgentMail inbox. The Recipe Inbox
  shows received and processing states, successful recipe previews, and clear
  failures. One plausible recipe URL is selected per email, inbound events and
  notifications are deduplicated, and the same URL validation and failure rules
  apply to both direct and email imports. The app scrapes the page before the
  recipe agent creates a structured preview; the recipe enters the
  Recipe Book only when the user explicitly saves it. A failed import offers
  **Try again**. Resubmitting a link retries it automatically unless the agent
  already read the page and found no complete recipe; each link is limited to
  five attempts.
- **Grocery lists:** list overview plus an interactive editor that can add,
  rename, check off, remove, restore, and change the quantity or unit of grocery
  items. Users can create recipe-named lists from saved recipe ingredients,
  merge two lists into a user-named replacement, delete a list, and save new or
  existing lists atomically to Convex. Checking an item off a saved list is
  stored immediately. Changes made to the same list elsewhere appear in an
  open editor, and saving removes only the items that were removed in that
  editor. Items from recipes are grouped by store section.
- **Settings:** profile details and account deletion.
- **Design-system states:** responsive layouts, accessible focus behavior,
  loading skeletons, status badges, alerts, dialogs, empty-state scaffolding,
  and a custom not-found page.

Generated recipe lists and manually created lists use the Convex-backed editor;
see `FRONTEND_DESIGN_GAPS.md` for remaining design decisions.

## Setup

### Convex project

Install dependencies and connect the local checkout to its Convex development
deployment:

```sh
npm install
npx convex dev
```

### Recipe page scraping

Direct, email-forwarded, and pasted-link recipe URLs run through a durable
workflow that fetches the page itself (`convex/recipeWebScrape.ts`), extracts
its schema.org Recipe JSON-LD and a markdown-ish rendering of the page text,
and stores that as bounded source evidence before agent processing. There is
no external scraping API or API key to configure for this step; it uses the
Convex deployment's own outbound `fetch` and the `cheerio` HTML parser. Page
and image downloads resolve each hostname and refuse private or loopback
addresses, and enforce their time and size limits while the body is read.

### Recipe search

Discover can search the web for recipes through the
[Tavily](https://www.tavily.com) search API (`convex/recipeSearch.ts`). Results
are filtered down to individual recipe pages, and choosing one sends its URL
through the same import workflow as a pasted link. Each distinct query is
cached in Convex for seven days, so repeats do not use search credits.

Create a Tavily API key (the free plan includes 1,000 searches a month) and
store it on the Convex deployment:

```sh
npx convex env set TAVILY_API_KEY
```

Without the key, search shows a "not set up" message and pasted links keep
working.

### Recipe model provider

After the page is scraped, the Convex Agent component sends it to a language
model (`convex/recipeAgent.ts`). It creates an editable recipe preview and
stores its structured ingredients. The user can then save it to the Recipe
Book, set it as current, or create a grocery list from its non-optional
ingredients. Agent threads and messages are still persisted by the Convex Agent
component, while normalized recipe and grocery data lives in the application's
Convex tables.

When the page publishes a complete schema.org `Recipe` in JSON-LD (a title,
ingredients, and instructions), the preview is built from that data directly
and no model is called (`convex/lib/recipeJsonLd.ts`). Ingredient lines are
parsed and given a grocery aisle by keyword; these imports record
`schema.org-json-ld` as their model. Pages without complete structured data
go to the model as described below.

Model output is cached by page URL for 30 days in `recipeExtractions` and shared
across users, so a page someone has already imported is not sent to the model
again. Before a page is sent, reader comments and reviews after the recipe are
dropped and the page text is capped, more tightly when JSON-LD is also sent.
The extraction step is retried once on failure, and each attempt is sent
without the earlier attempts' messages from the agent thread.

The model can come from Anthropic, OpenAI, or OpenRouter. Create an API key
for one of them and store it only on the Convex deployment, under that
provider's variable:

| Provider | `RECIPE_AGENT_PROVIDER` | API key variable |
| --- | --- | --- |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |

```sh
npx convex env set OPENAI_API_KEY
```

When exactly one of these keys is set, that provider is used. When several are
set, OpenAI is used if its key is among them; otherwise name the provider
explicitly, or imports fail with a message asking for it:

```sh
npx convex env set RECIPE_AGENT_PROVIDER openrouter
```

`RECIPE_AGENT_MODEL` names the model. It is optional for OpenAI, where the
default is `gpt-5-mini`, and for Anthropic, where the default is
`claude-sonnet-5`. It is required for OpenRouter, which has no default (use
its `vendor/model` identifier). The model
must support structured output:

```sh
npx convex env set RECIPE_AGENT_MODEL
```

Existing deployments that set only `ANTHROPIC_API_KEY` (and optionally
`RECIPE_AGENT_MODEL`) keep working with no change. OpenRouter is reached
through the AI SDK's OpenAI-compatible provider at
`https://openrouter.ai/api/v1`.

No model API key belongs in the frontend, `.env.local`, or repository. A missing
or inconsistent model configuration, like any other agent failure, is recorded
on the import, and uncertain or truncated results are marked as needing review.

The backend exposes authenticated operations for editing recipe fields,
instructions, ingredients, quantities, personal notes, grocery lists, and
grocery items. Recipe-card removal is a soft deletion so generated grocery data
can remain independent; deleting a grocery list removes that list and its item
provenance without deleting the recipe.

### Account email (Resend)

Convex Auth sends the sign-up confirmation, password-reset, and
email-change links through the [Resend](https://resend.com) Convex component.
Create a Resend API key and set it, the sender, and the frontend origin the
links point at on the Convex deployment:

```sh
npx convex env set RESEND_API_KEY
npx convex env set SENDER_EMAIL
npx convex env set SENDER_NAME   # optional, defaults to PerfectPlate
npx convex env set SITE_URL      # e.g. http://localhost:3000 for development
```

Without `SENDER_EMAIL`, mail is sent from Resend's test sender,
`onboarding@resend.dev`, which only delivers to the email address of the
Resend account owner. To let real users sign up, verify a domain in Resend and
use a sender address on it. `SITE_URL` defaults to `http://localhost:3000`.

### AgentMail

The official AgentMail Convex component stores inbox messages and threads,
verifies inbound webhook signatures, and routes recipe links into the
`recipeImports` table.

Open the [AgentMail console](https://console.agentmail.to) and select the
AgentMail account used by PerfectPlate. Create an API key, then select the
shared PerfectPlate inbox. Copy its inbox ID, which is usually the inbox email
address (`perfectplate@agentmail.to`). The inbox and API key must belong to the
same AgentMail account.

Store both values directly on the Convex development deployment. Omit each
value from the command so the CLI prompts for it without placing the secret in
your shell history:

```sh
npx convex env set AGENTMAIL_API_KEY
npx convex env set AGENTMAIL_INBOX_ID
```

If you need to target a particular deployment explicitly, append its deployment
name to both commands:

```sh
npx convex env set AGENTMAIL_API_KEY --deployment <deployment-name>
npx convex env set AGENTMAIL_INBOX_ID --deployment <deployment-name>
```

PerfectPlate uses this single configured inbox only to receive forwarded
recipes; account email goes through Resend, so sign-up does not depend on
AgentMail. It never creates AgentMail inboxes automatically.
Users should forward recipes from the email address they use to sign in so the
inbound webhook can privately associate each message with the correct account.
Forwards are attributed only to accounts whose email address is confirmed. The
match still relies on the message's From address, which AgentMail does not
authenticate for the application.
After changing either value, run
`npx convex dev --once` so the development backend is refreshed before testing
email delivery.

Register this endpoint in the AgentMail console so forwarded messages reach the
application:

```text
https://<your-convex-site>/agentmail/webhook
```

Copy the webhook signing secret into Convex:

```sh
npx convex env set AGENTMAIL_WEBHOOK_SECRET
```

Do not store the API key or webhook signing secret in `.env.local` or Git.

## Deployment

The Next.js frontend deploys to Vercel and the backend to Convex.

In the Vercel project settings:

- Set the build command to `npx convex deploy --cmd 'npm run build'` so each
  production build deploys the Convex functions first and receives
  `NEXT_PUBLIC_CONVEX_URL` automatically.
- Add `CONVEX_DEPLOY_KEY` (a production deploy key from the Convex dashboard)
  to the Production environment only.

On the production Convex deployment, set the site URL that the emailed links
point at, alongside the Resend, recipe model, and AgentMail values described
above:

```sh
npx convex env set SITE_URL https://perfectplate.vercel.app --prod
```

Register the production webhook, `https://<production-deployment>.convex.site/agentmail/webhook`,
in the AgentMail console. API keys and webhook secrets stay on the Convex
deployment; none belong in Vercel or Git.

### Upgrading an existing deployment

This version moves to Convex Auth 2.0, which cannot yet migrate Convex Auth v1
accounts. After upgrading, every user registers again. The v1 `users` rows stay
in the database with their old fields, but those accounts and their data are
not linked to the newly registered accounts.

## Known limitations

- Deleting an account revokes its sessions and removes its email addresses,
  but leaves its password hash behind, because Convex Auth 2.0 has no function
  to delete it. The hash can no longer be reached once the email addresses are
  gone.
