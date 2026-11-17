# PerfectPlate

PerfectPlate is an email-powered recipe organizer and meal-planning application.
The application uses Next.js, TypeScript, Tailwind CSS, and shadcn-style UI
components with Convex for authentication, realtime data, durable recipe
ingestion, and grocery-list workflows. The app scrapes pasted or emailed
recipe links directly, Anthropic's Claude structures recipe cards, and
AgentMail receives recipes forwarded to a shared inbox.

The frontend can be hosted on Vercel or Render, and is currently hosted on
Vercel at [perfectplate.vercel.app](https://perfectplate.vercel.app/); Convex
remains the production database and application backend. See
[Deployment](#deployment).

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
  sign-in, sign-up, and emailed password-recovery screens backed by Convex Auth.
  New accounts confirm their email address with a six-digit code before a
  session starts; an existing account that has not confirmed yet is asked for
  a code at its next sign-in. Application routes require an authenticated
  session.
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
  Anthropic recipe agent creates a structured preview; the recipe enters the
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

### Anthropic recipe agent

After the page is scraped, the Convex Agent component uses an Anthropic Claude
model through Anthropic's API directly (`convex/recipeAgent.ts`). It creates an
editable recipe preview and stores its structured ingredients. The user can
then save it to the Recipe Book, set it as current, or create a grocery list
from its non-optional ingredients. Agent threads and messages are still
persisted by the Convex Agent component, while normalized recipe and grocery
data lives in the application's Convex tables.

Create an Anthropic API key and store it only on the Convex deployment:

```sh
npx convex env set ANTHROPIC_API_KEY
```

The default model is `claude-sonnet-5`. To use another Claude model, set its
model identifier on the same deployment:

```sh
npx convex env set RECIPE_AGENT_MODEL
```

No Anthropic key belongs in the frontend, `.env.local`, or repository. Agent
failures are recorded on the import, and uncertain or truncated results are
marked as needing review.

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
AgentMail account used by PerfectPlate. Create an API key, then select the
shared PerfectPlate inbox. Copy its inbox ID, which is usually the inbox email
address (`perfectplate@agentmail.to`). The inbox and API key must belong to the
same AgentMail account; otherwise AgentMail returns `404 Inbox not found` when
the application tries to send mail.

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

PerfectPlate uses this single configured inbox for forwarded recipes and for
sending email-confirmation and password-reset codes, so sign-up depends on it
being configured. It never creates AgentMail inboxes automatically.
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

The Next.js frontend deploys to Vercel (or to Render; see [Render](#render))
and the backend to Convex.

In the Vercel project settings:

- Set the build command to `npx convex deploy --cmd 'npm run build'` so each
  production build deploys the Convex functions first and receives
  `NEXT_PUBLIC_CONVEX_URL` automatically.
- Add `CONVEX_DEPLOY_KEY` (a production deploy key from the Convex dashboard)
  to the Production environment only.

On the production Convex deployment, set the site URL used by Convex Auth,
alongside the Anthropic and AgentMail values described above:

```sh
npx convex env set SITE_URL https://perfectplate.vercel.app --prod
```

Email confirmation became a sign-up requirement after the first accounts were
created. Run this once, immediately after the first deployment that includes
it, so those earlier accounts are treated as confirmed:

```sh
npx convex run migrations:grandfatherEmailVerification --prod
```

It is safe to run again. To run it later without confirming accounts created
in the meantime, pass the deployment time in milliseconds, for example
`'{"createdBefore": 1794700800000}'`.

Register the production webhook, `https://<production-deployment>.convex.site/agentmail/webhook`,
in the AgentMail console. API keys and webhook secrets stay on the Convex
deployment; none belong in Vercel or Git.

### Render

The repository also includes a Render Blueprint, `render.yaml`, that runs the
frontend as a Node web service. It uses the same build as Vercel
(`npx convex deploy --cmd 'npm run build'`), so each deploy pushes the Convex
functions first and builds with the production `NEXT_PUBLIC_CONVEX_URL`.

1. In the Render dashboard, choose **New** → **Blueprint** and pick this
   repository.
2. When prompted for `CONVEX_DEPLOY_KEY`, paste a **production** deploy key
   from the Convex dashboard. Render asks for it only when the Blueprint is
   first created; change it later in the service's environment settings.
3. After the first deploy, point Convex Auth at the Render URL:

   ```sh
   npx convex env set SITE_URL https://<service>.onrender.com --prod
   ```

   `SITE_URL` holds a single origin, so setting it to the Render URL replaces
   the Vercel one for emailed links and redirects; a production Convex
   deployment serves one frontend host at a time.

The production Convex setup above (the AgentMail webhook, the one-time
migration, and the API keys on the Convex deployment) applies to Render the
same way. The Blueprint uses Render's free plan, which spins the service down
when it is idle, so the first request after a quiet period waits while it
starts again.
