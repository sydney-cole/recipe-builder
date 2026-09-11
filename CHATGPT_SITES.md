# Deploy PerfectPlate with ChatGPT Sites

PerfectPlate should use ChatGPT Sites for its public frontend URL and keep
Convex as its application backend. Do not migrate the Convex database,
functions, workflows, authentication data, or integrations into Sites storage.

Sites associates a local-project build with a Git commit. Before importing the
project, review the working tree and commit every source file that the deployed
version should contain. Untracked files are not a reliable deployment input.

## 1. Prepare the production backend

Install from the lockfile and verify both the application and Worker builds:

```sh
npm ci
npm run check
npm run build
npm run build:worker
npx wrangler deploy --dry-run
```

The Worker build uses the pinned OpenNext and Wrangler versions in
`package.json`. Its generated `.open-next/worker.js` entrypoint and
`.open-next/assets` directory are local build output and must not be committed.
OpenNext's support for the Next.js 16 Node.js `proxy.ts` runtime is experimental,
so validate authentication again on every saved Sites version.

Only deploy the Convex backend after those checks pass:

```sh
npx convex deploy
```

Configure these secrets on the **production Convex deployment**, not in
ChatGPT Sites and not in Git:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_WEBHOOK_SECRET`
- `AGENTMAIL_API_KEY`
- `AGENTMAIL_INBOX_ID`
- `AGENTMAIL_WEBHOOK_SECRET`
- `RECIPE_AGENT_MODEL` (optional)
- `RECIPE_AGENT_PROVIDER` (optional)

After deploying, record the production URLs:

```text
NEXT_PUBLIC_CONVEX_URL=https://<production-deployment>.convex.cloud
CONVEX_SITE_URL=https://<production-deployment>.convex.site
```

The `.convex.cloud` URL is used by the Convex client. The `.convex.site` URL is
used by Convex Auth and the AgentMail and Firecrawl HTTP routes.

## 2. Import the local project into Sites

Open **Sites** in the ChatGPT desktop app and choose the option to start from a
compatible local project. Select this repository, then use this prompt:

```text
Deploy this existing PerfectPlate project with ChatGPT Sites. First check
whether its Next.js runtime, middleware, and Convex Auth integration are
compatible, and show me any required source changes before applying them.

Keep the existing hosted Convex production deployment as the source of truth
for the database, authentication, realtime queries, mutations, actions,
workflows, HTTP webhooks, AgentMail integration, Firecrawl integration, and
OpenAI recipe agent. Do not replace those systems with D1, R2, mock data, or a
new authentication system.

The root landing page must remain available to signed-out visitors. Preserve
the current protected /app routes and sign-in/sign-up flow. Never place API
keys or webhook secrets in client code or generated files.

Create a reviewable saved version, but do not deploy it until I approve the
preview. Tell me exactly which build command, runtime, and environment values
the Site needs.
```

If Sites proposes replacing Convex or removing Next.js middleware, stop and
review the proposal rather than accepting it automatically.

## 3. Configure Sites environment values

In **Sites > PerfectPlate > More actions > Settings**, add the confirmed
production value for:

- `NEXT_PUBLIC_CONVEX_URL`

This public URL is compiled into the browser bundle, so rebuild the Site after
changing it. Supply `CONVEX_SITE_URL` to the Sites server runtime only if the
saved build reports that it is required there; its authoritative use is in the
hosted Convex Auth configuration.

Keep OpenAI, Firecrawl, and AgentMail secrets exclusively in the Convex
deployment environment. Do not copy them into a prompt or commit them.

Ask Sites to rebuild the saved version after changing environment values.

## 4. Review and publish

Before publishing, verify the preview:

1. The landing page loads while signed out.
2. Sign-up and sign-in complete successfully.
3. `/app`, recipe discovery, imports, recipe details, and grocery lists connect
   to the production Convex deployment.
4. Browser developer tools show Convex requests going only to the intended
   production `.convex.cloud` and `.convex.site` hosts.
5. No API keys or webhook secrets appear in page source, browser bundles, logs,
   or network responses.

Then deploy the approved saved version. Open **Share** and set **Who has
access** to **Anyone on the internet**. If that option is unavailable, public
publishing is not enabled for the current account or workspace and the URL does
not yet satisfy the hackathon requirement.

## 5. Judge-access check

Copy the final `https://<name>.openai.chatgpt.site` URL and test it in a private
browser window where you are signed out of ChatGPT. Confirm that it opens
without an invitation. Repeat the test on mobile and follow at least one full
user flow before placing the URL in `hackathon.md`.

Do not update the hackathon log's **Live app** field until this logged-out test
passes.
