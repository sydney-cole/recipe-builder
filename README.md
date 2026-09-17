# PerfectPlate

PerfectPlate is an email-powered recipe organizer and meal-planning application.
The current implementation provides a frontend built with Next.js, TypeScript,
Tailwind CSS, and shadcn-style UI components. Account access and the Recipe Book
are connected to Convex; discovery and subscription flows still use local mock
data while their backend integrations are being built.

For the public hackathon deployment, follow the
[ChatGPT Sites deployment runbook](./CHATGPT_SITES.md). The hosted Site keeps
Convex as the production database and application backend.

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
  sign-in and sign-up screens backed by Convex Auth. Application routes require
  an authenticated session.
- **Application shell:** responsive desktop sidebar, top navigation, and a
  five-item mobile bottom navigation.
- **Dashboard:** quick access to recipe discovery, email imports, grocery lists,
  and realtime recently saved recipes.
- **Recipe discovery:** search scaffolding for ingredients, moods, and recipe
  types, including removable search terms and explained mock recommendations.
- **Recipe Book:** Convex-backed, searchable and sortable recipe gallery with
  links to detailed recipe pages and their ingredients and instructions.
- **Recipe details:** ingredients, cooking instructions, working serving
  controls, source attribution, and on-demand grocery-list creation.
- **Recipe importing:** authenticated users can provision an AgentMail inbox,
  email or paste recipe links, and see Convex-backed import states. Inbound
  AgentMail webhooks are verified and deduplicated by the component. Firecrawl
  extracts queued links before the OpenAI recipe agent creates saved cards.
- **Food-blog subscriptions:** add and manage mock food-blog/newsletter
  subscriptions with active, pending, and paused states.
- **Grocery lists:** list overview plus an interactive editor that can add,
  rename, check off, remove, restore, and change the quantity or unit of grocery
  items. Users can create recipe-named lists from saved recipe ingredients,
  merge two lists into a user-named replacement, delete a list, and save new or
  existing lists atomically to Convex.
- **Settings:** frontend controls for profile details, recipe inbox information,
  and notification preferences.
- **Design-system states:** responsive layouts, accessible focus behavior,
  loading skeletons, status badges, alerts, dialogs, empty-state scaffolding,
  and a custom not-found page.

Subscriptions, discovery suggestions, and the example "This week" grocery card
still use some data from `lib/data/mock-data.ts`.
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

### Firecrawl

The project uses Firecrawl's official Convex component. Direct, email-forwarded,
and trusted agent-discovered recipe URLs run through a durable workflow that
stores bounded source evidence before agent processing. The component webhook
is mounted at `/firecrawl/webhook` on the Convex HTTP Actions URL.

Create a Firecrawl API key and set it on your Convex development deployment:

```sh
npx convex env set FIRECRAWL_API_KEY
```

For durable crawls, create a webhook secret in the Firecrawl dashboard and set
it on the same deployment:

```sh
npx convex env set FIRECRAWL_WEBHOOK_SECRET
```

Never put either secret in Git or in client-side environment variables. Each
developer or deployment must configure its own Convex environment variables.

### OpenAI recipe agent

After Firecrawl stores a recipe artifact, the Convex Agent component uses an
OpenAI model through OpenAI's API directly. It creates an editable recipe card,
saves it to the importing user's Recipe Book, and stores its structured
ingredients. A separate grocery list is created from the non-optional
ingredients only when the user selects **Create list** on that recipe. Agent
threads and messages are still persisted by the Convex Agent component, while
normalized recipe and grocery data lives in the application's Convex tables.

Create an OpenAI API key and store it only on the Convex deployment:

```sh
npx convex env set OPENAI_API_KEY
```

The default direct model is `gpt-5-mini`. To use another OpenAI model, set its
model identifier on the same deployment:

```sh
npx convex env set RECIPE_AGENT_MODEL
```

No OpenAI key belongs in the frontend, `.env.local`, or repository. Agent
failures are recorded on the import, and uncertain or truncated results are
marked as needing review.

The provider selection lives in `convex/recipeAgent.ts`. A future move back to
Convex AI Gateway requires no workflow rewrite: enable a supported Convex plan
and set `RECIPE_AGENT_PROVIDER=convex_gateway`. The same file keeps the gateway
adapter and normalizes `RECIPE_AGENT_MODEL` to the gateway's
`provider/model` format.

The backend exposes authenticated operations for editing recipe fields,
instructions, ingredients, quantities, personal notes, grocery lists, and
grocery items. Recipe-card removal is a soft deletion so generated grocery data
can remain independent; deleting a grocery list removes that list and its item
provenance without deleting the recipe.

### AgentMail

The official AgentMail Convex component stores inbox messages and threads,
verifies inbound webhook signatures, and routes recipe links into the
`recipeImports` table.

Open the [AgentMail console](https://console.agentmail.to) and select the
AgentMail account that will send PerfectPlate email. Create an API key, then
open **Inboxes** and either select an existing inbox or create one. Copy its
inbox ID, which is usually the inbox email address (for example,
`perfectplate@agentmail.to`). The inbox and API key must belong to the same
AgentMail account; otherwise AgentMail returns `404 Inbox not found` when the
application tries to send mail.

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

PerfectPlate uses this configured inbox both for recipe-email intake and for
sending password-reset codes. After changing either value, run
`npx convex dev --once` so the development backend is refreshed before testing
email delivery.

Start the application, create an account, and use **Connect recipe inbox** on
the imports page. Then register this endpoint in the AgentMail console:

```text
https://<your-convex-site>/agentmail/webhook
```

Copy the webhook signing secret into Convex:

```sh
npx convex env set AGENTMAIL_WEBHOOK_SECRET
```

Do not store the API key or webhook signing secret in `.env.local` or Git.
