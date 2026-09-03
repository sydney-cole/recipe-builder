# PerfectPlate

PerfectPlate is an email-powered recipe organizer and meal-planning application.
The current implementation provides a complete frontend scaffold built with
Next.js, TypeScript, Tailwind CSS, and shadcn-style UI components. Application
data is currently mocked so frontend development does not depend on a running
backend.

## Run the code locally

### Prerequisites

- Node.js 20 or newer
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

The current frontend uses local mock data and does **not** require Convex to be
running. If you are also working on the existing Convex integration, open a
second terminal in the project root and run:

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

## Frontend features currently supported

The frontend currently includes the following responsive, navigable flows:

- **Marketing and authentication:** landing page, sign-in, and sign-up screens.
  Authentication forms demonstrate the intended interaction but are not yet
  connected to a user account backend.
- **Application shell:** responsive desktop sidebar, top navigation, and a
  five-item mobile bottom navigation.
- **Dashboard:** quick access to recipe discovery, email imports, grocery lists,
  recently saved recipes, and items needing attention.
- **Recipe discovery:** search scaffolding for ingredients, moods, and recipe
  types, including removable search terms and explained mock recommendations.
- **Recipe Book:** searchable and sortable saved-recipe gallery with links to
  detailed recipe pages.
- **Recipe details:** ingredients, cooking instructions, serving controls,
  source attribution, and an action for adding needed ingredients to a grocery
  list.
- **Recipe importing:** an assigned-inbox preview for emailed recipe links, a
  direct URL import form, and received, scraping, ready, and attention states.
  AgentMail and Firecrawl are not yet wired to these frontend controls.
- **Food-blog subscriptions:** add and manage mock food-blog/newsletter
  subscriptions with active, pending, and paused states.
- **Grocery lists:** list overview plus an interactive editor that can add,
  rename, check off, remove, restore, and change the quantity or unit of grocery
  items.
- **Settings:** frontend controls for profile details, recipe inbox information,
  and notification preferences.
- **Design-system states:** responsive layouts, accessible focus behavior,
  loading skeletons, status badges, alerts, dialogs, empty-state scaffolding,
  and a custom not-found page.

All recipe, import, subscription, and grocery data currently comes from
`lib/data/mock-data.ts`. This keeps the frontend usable while providing a clear
boundary for replacing mock operations with Convex queries, mutations, and
actions later.

## Convex project setup

Install dependencies and connect the local checkout to its Convex development
deployment:

```sh
npm install
npx convex dev
```

## Firecrawl

The project uses Firecrawl's official Convex component. It supports one-page
scrapes, URL mapping, web search, and durable crawls. The component webhook is
mounted at `/firecrawl/webhook` on the Convex HTTP Actions URL.

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
