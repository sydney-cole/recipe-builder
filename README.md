# Recipe Builder

## Project setup

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
