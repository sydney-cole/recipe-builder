# DESIGN.md: PerfectPlate Frontend

## Source and scope

- **Product:** PerfectPlate, an email-powered recipe importer, recipe discovery assistant, personal Recipe Book, food-blog subscription agent, and editable grocery-list builder.
- **Capture date:** 2026-09-03.
- **Target stack:** Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui.
- **Evidence:** Firecrawl branding extraction, page markdown, links, and full-page screenshots.
- **Output boundary:** Design system and build specification only. This document does not implement the frontend.

### Reference sites

1. [RecipeSage](https://recipesage.com/) — requested reference for its grounded green food theme.
2. [Shopify Admin](https://admin.shopify.com/store/dg3rcj-v1?welcome) — requested reference for application layout and navigation.
3. [Plan to Eat](https://www.plantoeat.com/) — selected for its recipe-to-plan-to-shopping workflow and calm editorial presentation.
4. [Mealime](https://www.mealime.com/) — selected for its friendly cooking imagery, generous whitespace, and clear sequential storytelling.
5. [Samsung Food](https://samsungfood.com/) — selected for its bold hierarchy and focused recipe, planning, and grocery feature navigation.

The supplied Shopify URL redirected Firecrawl to Shopify's login screen. No private store data was accessed. Application-shell guidance therefore combines the observed Shopify login treatment with Shopify's [official admin navigation documentation](https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview). Any recommendation based on that documentation rather than a captured dashboard is marked **inferred**.

Raw, compacted evidence is stored locally in `.firecrawl/design-sources.json`.

## Reference screenshots

### RecipeSage

![Full-page RecipeSage reference](./.firecrawl/recipesage-screenshot.png)

### Shopify login surface

![Shopify login reference](./.firecrawl/shopify-screenshot.png)

### Plan to Eat

![Full-page Plan to Eat reference](./.firecrawl/plantoeat-screenshot.png)

### Mealime

![Full-page Mealime reference](./.firecrawl/mealime-screenshot.png)

### Samsung Food

![Full-page Samsung Food reference](./.firecrawl/samsungfood-screenshot.png)

Use these screenshots only as visual research. Do not copy their logos, photography, illustrations, trademarks, or copy into PerfectPlate.

## Evidence legend

- **Observed:** A value or pattern returned by Firecrawl or visible in a captured screenshot.
- **Inferred:** A practical PerfectPlate recommendation synthesized from several references.
- **Original:** A new product-specific decision, not copied from a source.

## Product capability contract

The frontend scaffold must make these five capabilities first-class. Navigation, routes, reusable components, and application states should be created around them even before every backend operation is connected.

1. **Email a recipe to PerfectPlate.** A user can send or forward an email containing a recipe link or recipe page to their assigned PerfectPlate inbox. The application shows receipt, Firecrawl extraction progress, parsed ingredients and instructions, failures, and the resulting recipe review screen.
2. **Discover recipes by intent.** A user can ask for recipe ideas using ingredients they already have, a mood or craving, or a recipe type. Results explain why each suggestion matches and expose a clear `Add to Recipe Book` action.
3. **Recipe Book.** Saved recipes live in a section titled exactly **Recipe Book**. Each saved recipe can add all needed ingredients—or a user-selected subset—to a grocery list.
4. **Food-blog subscriptions.** A dedicated **Subscriptions** tab lets a user ask the email agent to subscribe to food blogs, view subscription status, and review recipes received from those subscriptions.
5. **Editable grocery list.** The Grocery List tab lets users add and remove ingredients, edit names, alter quantities and units, check off items, and retain recipe-source context.

### Frontend/backend boundaries

The frontend should define typed UI states for these operations without embedding provider logic:

- Email receipt and delivery come from AgentMail-backed Convex functions.
- Web extraction and recipe parsing come from Firecrawl-backed Convex actions.
- Search suggestions, saved recipes, subscription status, and grocery edits come from authenticated Convex queries and mutations.
- Provider keys, webhook secrets, assigned inbox identifiers, and raw webhook payloads never reach client components.
- Every paid or user-owned operation displays pending, success, recoverable failure, and terminal failure states.

## Design direction

PerfectPlate should feel like a calm, organized kitchen workspace: fresh enough to make food inviting, structured enough to manage a large recipe collection, and direct enough to use while shopping or cooking.

The visual language is **warm utility**:

- Sage green establishes trust, freshness, and continuity with the cooking domain.
- Warm cream surfaces prevent the app from feeling clinical.
- Apricot is reserved for discovery, importing, and celebratory moments.
- Food photography supplies richness; application chrome stays quiet.
- An efficient desktop shell supports repeat use while mobile layouts prioritize one-handed shopping and cooking.
- Dense data is grouped into cards and categories, but generous page-level spacing keeps the interface breathable.

Avoid rustic scrapbook styling, excessive gradients, glassmorphism, novelty food icons, and decorative elements that compete with recipe photography.

## Design tokens

### Source observations

- **RecipeSage observed:** primary `#5E8B56`, background `#FAFAFA`, primary text `#1B1D1F`, 4px base spacing, and approximately 8px radii.
- **Plan to Eat observed:** blue `#216283`, dark navy `#112436`, coral `#EA6752`, and background `#F8FAFC`.
- **Mealime observed:** green `#5EBD21`, white background, text `#464646`, and pale aqua accents.
- **Samsung Food observed:** orange `#FF9838`, near-black text, white surfaces, and large rounded feature treatments.
- **Shopify login observed:** compact Inter-based UI, dark framing surface, light centered card, and 6–8px controls.

### PerfectPlate color roles

The following palette is **original/inferred**. It is inspired by the source roles but tuned for contrast and product cohesion.

| Token | Light value | Purpose |
|---|---:|---|
| `--background` | `#FBFAF6` | Warm application background |
| `--surface` | `#FFFFFF` | Cards, dialogs, navigation surfaces |
| `--surface-subtle` | `#F2F5EE` | Filters, grouped rows, secondary panels |
| `--foreground` | `#20251F` | Primary text |
| `--muted-foreground` | `#667064` | Supporting text and metadata |
| `--border` | `#DDE4D8` | Default separators and input borders |
| `--primary` | `#3F6B3A` | Primary actions and active navigation |
| `--primary-hover` | `#345B31` | Primary hover/pressed state |
| `--primary-soft` | `#E4EEE0` | Selected rows, badges, subtle highlights |
| `--accent` | `#DC7058` | Import, discovery, and emphasis |
| `--accent-hover` | `#D76B53` | Accent hover/pressed state |
| `--accent-soft` | `#F9E7E0` | Import progress and celebratory surfaces |
| `--aqua-soft` | `#E7F5F3` | Planning and grocery-list section tint |
| `--warning` | `#A85B12` | Warnings and partial completion |
| `--danger` | `#B53A3A` | Destructive actions and errors |
| `--success` | `#2F7443` | Completed imports and confirmations |
| `--focus` | `#2563EB` | High-visibility keyboard focus ring |

Use `--primary` with white text. Use the lighter accent colors only as backgrounds with dark foreground text. Never use pale green or apricot for body text.

### Dark mode

Dark mode is optional for the hackathon build. If implemented, use warm charcoal rather than pure black:

- Background `#161A16`
- Surface `#202620`
- Elevated surface `#283028`
- Foreground `#F4F5F1`
- Muted foreground `#B4BCAF`
- Border `#3B463A`
- Primary `#8DB886`
- Accent `#EF947E`

Do not delay the core responsive experience to implement dark mode.

### Typography

Use open-source fonts through `next/font`:

- **UI and body:** Manrope, fallback `ui-sans-serif, system-ui, sans-serif`.
- **Display/editorial accent:** Fraunces, fallback `Georgia, serif`.

Use Fraunces only for public marketing headlines and occasional recipe titles. Use Manrope throughout the authenticated app for clarity at data-heavy sizes.

| Token | Size / line height | Weight | Usage |
|---|---|---:|---|
| `display-xl` | 52px / 1.05 | 650 | Landing hero, desktop only |
| `display-lg` | 40px / 1.1 | 650 | Marketing section headings |
| `heading-1` | 32px / 1.2 | 700 | App page title |
| `heading-2` | 24px / 1.25 | 700 | Major section or dialog title |
| `heading-3` | 20px / 1.3 | 650 | Card and panel headings |
| `body-lg` | 18px / 1.6 | 400 | Landing copy and recipe introduction |
| `body` | 16px / 1.5 | 400 | Default application copy |
| `body-sm` | 14px / 1.45 | 400–600 | Metadata, labels, navigation |
| `caption` | 12px / 1.4 | 600 | Tags, timestamps, compact status |

On screens below 768px, reduce `display-xl` to 40px and `heading-1` to 28px. Recipe instructions should never render below 17px.

### Spacing and sizing

- Base spacing unit: 4px.
- Allowed spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`.
- App content max width: 1440px.
- Reading content max width: 760px.
- Standard page padding: 32px desktop, 24px tablet, 16px mobile.
- Section gap: 48px desktop, 32px mobile.
- Card internal padding: 20–24px desktop, 16px mobile.
- Minimum interactive height: 44px; primary mobile actions may use 48px.

### Radius, borders, and shadows

- Input and compact-button radius: 8px.
- Standard card radius: 12px.
- Image and large-panel radius: 16px.
- Promotional/empty-state panel radius: 24px.
- Pill and tag radius: 9999px.
- Default border: 1px solid `--border`.
- Card shadow: `0 1px 2px rgb(28 35 27 / 0.05), 0 8px 24px rgb(28 35 27 / 0.06)`.
- Dialog shadow: `0 24px 64px rgb(17 24 16 / 0.18)`.

Prefer borders and background shifts to heavy shadows. Food images can carry stronger visual weight than surrounding UI.

### Motion

- Hover/focus transitions: 120–160ms ease-out.
- Drawer/dialog transitions: 180–220ms ease-out.
- Import progress changes: 240ms ease-in-out.
- Use opacity and transform only; avoid layout-shifting animation.
- Respect `prefers-reduced-motion` and disable nonessential movement.

## Application shell and navigation

### Desktop shell

**Inferred from Shopify's documented admin model:** use a persistent left sidebar and global top bar.

- Sidebar width: 248px expanded, 72px collapsed.
- Top bar height: 64px.
- Sidebar groups:
  - **Primary:** Home, Discover, Recipe Book, Subscriptions, Grocery List.
  - **Secondary:** Email Imports, Favorites, and recently used grocery lists when data exists.
  - **Utility:** Settings, Help, and Profile at the bottom.
- Top bar:
  - Global recipe search with `Cmd/Ctrl + K` shortcut.
  - Prominent `Email or import recipe` button.
  - Notifications/status entry point.
  - User menu.
- Main content scrolls independently while navigation remains stable.
- Collapse the sidebar automatically below 1100px.

Active navigation uses a `--primary-soft` background, `--primary` icon/text, and a 3px leading indicator. Do not rely on color alone; use `aria-current="page"` and visible shape changes.

### Mobile navigation

- Sticky top bar: logo/wordmark, page title when useful, and profile menu.
- Bottom navigation: Home, Discover, Recipe Book, Subscriptions, Grocery.
- Email/import actions appear in the Home quick-action region and as a context action in Recipe Book.
- Search opens as a full-width command sheet.
- Grocery-list pages may replace bottom navigation with a sticky action bar while the user is actively shopping.
- Preserve safe-area padding on iOS.

### Navigation behavior

- Keyboard shortcut opens global search.
- Search returns grouped results: Suggested Recipes, Recipe Book, Ingredients, Subscriptions, and Grocery Lists.
- Breadcrumbs appear only beyond one level of hierarchy, such as `Recipe Book / Weeknight Pasta`.
- Back behavior must be predictable on mobile and never discard unsaved form changes without confirmation.

## Core components

### Buttons

- **Primary:** solid green, white text; one dominant action per region.
- **Accent:** solid coral with `--foreground` text; reserve for recipe import and discovery actions.
- **Secondary:** white or transparent, visible border, dark text.
- **Ghost:** navigation and compact utility actions.
- **Destructive:** red text on a soft red surface; require confirmation for irreversible actions.
- Every button supports default, hover, pressed, focus-visible, disabled, and loading states.
- Loading buttons retain width, show a spinner, and use an action-specific label such as “Importing…”.

### Inputs and forms

- Label above input; helper or error text below.
- Default height 44px, 8px radius, and 1px border.
- Focus uses a 3px `--focus` ring with 2px offset.
- URL inputs may include a leading link icon and trailing paste action.
- Never use placeholder text as the only label.
- Validate after blur or submit, not on every keystroke.

### Recipe cards

- Aspect ratio 4:3 image with 16px top corners.
- Title clamps to two lines.
- Metadata row: total time, servings, and source.
- Optional labels use compact neutral or green-soft pills.
- Favorite button is always keyboard reachable and has an accessible name.
- Hover raises the card by no more than 2px; the entire title/image region is one link.

### Grocery rows

- Minimum height 52px.
- Checkbox at the leading edge with a 44px target.
- Ingredient and amount form the primary line; source recipes are secondary.
- Checked items move to a collapsible completed group and remain recoverable.
- Category headers stay sticky while shopping on mobile.

### Status badges

- Queued: neutral gray.
- Scraping/importing: blue with spinner.
- Parsed/ready: green.
- Failed: red with retry affordance.
- Pair every color with text and an icon.

### Dialogs, sheets, and alerts

- Desktop destructive/decision flows use centered dialogs, maximum width 480px.
- Mobile filters and secondary forms use bottom sheets.
- Toasts confirm reversible success and disappear after 4–6 seconds.
- Persistent failures use an inline alert near the affected content.
- Never communicate a failed recipe import only through a toast.

### Skeletons and progress

- Match skeleton geometry to final content.
- Recipe Book and discovery grids show 6 card skeletons on desktop and 3 on mobile.
- Recipe intake uses a labeled stepper: `Email received → Link found → Extracting recipe → Saving`.
- Progress must not invent a percentage when the backend supplies only a state.

## Page specifications

### Landing page

**Goal:** Explain the email-to-Recipe-Book-to-grocery-list loop within one viewport and move users to sign up, discover, or email a recipe.

- Compact horizontal marketing navigation: Product, How it works, and Sign in.
- Hero uses a split layout: original food photography on one side and a PerfectPlate interface preview on the other.
- Headline describes the outcome, not the technology.
- Primary CTA: create an account. Secondary CTA: see how emailing a recipe works.
- Four-step workflow directly below the hero: Email, Extract, Save, Shop.
- Follow with a restrained feature grid and a final CTA.
- Avoid long testimonial walls and app-store badges unless native apps exist.

### Authentication

- Centered 420px card on a subtle warm background.
- Product mark above the card; no third-party reference logos.
- Tabs or clear links between Sign in and Create account.
- Password visibility toggle, forgot-password path when supported, and inline error summary.
- Preserve the requested destination after authentication.
- On mobile, remove the elevated card shell and use the full viewport with 20px padding.

### Home dashboard

**Inferred from Shopify:** prioritize actionable status over decorative analytics.

- Welcome heading plus quick actions for `Email a recipe` and `Discover recipes`.
- Continue section for imports in progress or recently failed.
- Recently saved Recipe Book items in a horizontal or 4-card grid.
- Subscription review card when newly received blog recipes need attention.
- Active grocery list card showing remaining item count and a resume action.
- Optional compact metrics: saved recipes, favorites, and unchecked grocery items.
- Hide empty metric panels; replace them with onboarding tasks for new users.

### Discover

- Search begins with one conversational field: “What would you like to cook?”
- Offer optional structured inputs beneath it: ingredients on hand, mood/craving, recipe type, dietary needs, and maximum time.
- Users can add and remove ingredient chips without rewriting the full request.
- Results use recipe cards with image, title, time, match reasons, missing ingredients, and source attribution.
- Every result has a prominent `Add to Recipe Book` action and a secondary `View recipe` action.
- Adding a suggestion confirms success in place and changes the action to `In Recipe Book` without removing the result.
- Search history is private to the authenticated user and can be cleared.
- Empty results suggest relaxing one constraint rather than presenting a dead end.

### Recipe Book

- The page title is exactly **Recipe Book**.
- Page heading, saved-recipe count, and `Email or import recipe` action.
- Sticky toolbar containing search, filter chips, sort menu, and grid/list toggle.
- Desktop: 3–4 column grid depending on viewport.
- Tablet: 2 columns. Mobile: one dense list or two compact cards if images remain readable.
- Filters: favorites, cuisine, category, source, and maximum time.
- URL query parameters preserve search, filters, sort, and page state.
- Use pagination or cursor-based progressive loading; never render an unbounded collection.
- Each card exposes `Add ingredients to grocery list` in its overflow menu; recipe detail pages use a primary labeled action.
- The grocery action opens a review sheet where users select a list, adjust servings, include or exclude ingredients, and confirm.

### Email recipe intake and manual import

- Single-purpose page with a maximum 680px content width.
- Lead with the user's assigned recipe inbox, a copy button, and concise forwarding instructions.
- Never hardcode or expose another user's inbox. Load the address only for the authenticated account.
- Provide two intake methods: `Email a recipe` as the primary path and `Paste a URL` as the secondary path.
- The email path shows recent inbound messages and their states: Received, Finding link, Scraping, Ready to review, or Needs attention.
- The URL path uses a large URL field and accent-colored `Import recipe` action.
- Explain supported public recipe URLs and email formats without promising that every private or paywalled page can be read.
- During intake, show the state stepper `Email received → Link found → Extracting recipe → Saving` and allow the user to leave; processing continues on the backend.
- On success, display a compact preview with title, image, ingredient count, and `Review recipe` action.
- On failure, preserve the source message or URL, explain the recoverable reason, and offer Retry, Paste another URL, or Manual entry.
- If an email contains multiple recipe links, require the user to choose which recipes to import rather than silently importing all of them.

### Recipe details

- Desktop header: 40% image and 60% recipe summary.
- Title, description, source, time, servings, tags, favorite, and add-to-list actions.
- Sticky desktop subnavigation: Overview, Ingredients, Instructions, Nutrition.
- Ingredients and instructions form two coordinated columns at wide widths; stack on mobile.
- Ingredient checkboxes are session-local cooking aids unless explicitly saved.
- Serving adjustment shows the original serving value and makes changed quantities obvious.
- Mobile uses a sticky bottom action for `Add to grocery list`.

### Food-blog subscriptions

- The page title is **Subscriptions** and is reachable as a primary navigation tab.
- Primary action: `Subscribe with agent`.
- Subscription form accepts a food-blog URL and, when needed, displays a backend-provided confirmation step.
- Never ask the user to enter or expose the agent inbox password in the frontend.
- Subscription cards show blog name or domain, status, last received date, imported-recipe count, and overflow actions.
- Statuses: Pending confirmation, Active, Paused, Action required, and Unsubscribed.
- New emails from a subscription appear in a review queue before recipes are added to Recipe Book unless the user explicitly enables auto-save for that source.
- Allow Pause, Resume, and Unsubscribe with clear confirmation and optimistic feedback only when backend operations are reversible.
- Provide an empty state explaining that the agent can receive new recipes from favorite food blogs.

### Grocery lists

- Lists index shows active list first, then completed/archived lists.
- Grocery-list detail is optimized for mobile and one-handed use.
- Group items by aisle/category with sticky section headers.
- Display aggregated amount first and source recipes in expandable detail.
- Toolbar actions: add ingredient, hide completed, share/email when implemented, and overflow menu.
- Users can edit an ingredient name, quantity, and unit inline or in a mobile edit sheet.
- Users can remove an item with Undo; removing one recoverable item does not require a modal.
- Users can manually add an ingredient without connecting it to a recipe.
- Ingredients added from Recipe Book retain their recipe source while allowing list-specific quantity edits.
- When several recipes contribute the same ingredient, show the aggregated quantity and preserve the individual source breakdown.
- Show offline or reconnect status if the client loses connectivity.
- Use optimistic checkbox interaction, followed by a clear rollback message on failure.

## Responsive layout rules

| Range | Layout behavior |
|---|---|
| `<640px` | Single column, 16px page padding, bottom navigation, sheets instead of dialogs where practical |
| `640–767px` | Wider single column, optional two-column compact recipe grid |
| `768–1099px` | Collapsed rail navigation, two-column content grids |
| `1100–1439px` | Expanded sidebar, three-column recipe grid |
| `≥1440px` | Expanded sidebar, constrained 1440px content region, four-column recipe grid |

Do not simply shrink desktop layouts. Reorder actions so the most common mobile task—checking grocery items—remains reachable near the thumb zone.

## Product states

### Empty

- **No Recipe Book recipes:** original illustration or quiet ingredient motif, short explanation, and Discover or Email recipe CTAs.
- **No search results:** preserve filters, show the query, and offer Clear filters.
- **No subscriptions:** explain how the agent can subscribe to food blogs and receive new recipe emails.
- **No grocery lists:** explain that lists can be created manually or from a Recipe Book recipe.
- Empty states must never resemble errors.

### Loading

- First-load pages use skeletons.
- Subsequent realtime updates retain current content and show only local pending indicators.
- Avoid full-page spinners after the application shell has loaded.

### Success

- Confirm saved/favorited/check-off actions optimistically where safe.
- Imported recipes receive a persistent success panel with a next action.
- Email delivery success should report “sent” only after the backend confirms provider acceptance.

### Validation

- Place specific messages beside the field.
- Move focus to a form-level summary after a failed submit when several fields are invalid.
- URL validation distinguishes malformed URLs, unsupported private pages, and remote scrape failures.

### Failure

- Use plain language and preserve user work.
- Provide Retry when the operation is safe and idempotent.
- Include a compact reference ID for unexpected backend failures, never a secret or raw stack trace.
- Firecrawl credit/rate-limit failures and AgentMail delivery failures need provider-neutral user messages.

## Accessibility requirements

- Meet WCAG 2.2 AA for the hackathon build.
- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful UI graphics.
- Use semantic landmarks: header, nav, main, aside, and footer.
- Provide a skip-to-content link.
- All functionality must work with keyboard only.
- Focus order follows visual order; focus is never trapped except inside a modal dialog.
- Interactive targets are at least 44×44px on touch screens.
- Every icon-only action has an accessible name and tooltip where helpful.
- Recipe images use meaningful alt text; decorative food textures use empty alt text.
- Announce import progress and completion through an `aria-live="polite"` region.
- Announce destructive failures through `role="alert"` without repeatedly interrupting the user.
- Do not encode ingredient status, import status, or validation using color alone.
- Respect zoom to 200%, text reflow, reduced motion, and increased text spacing.

## Content style

- Voice: capable, warm, concise, and nonjudgmental.
- Headings focus on an outcome: saving time, finding a recipe, or finishing a shopping trip.
- Buttons use direct verbs: Import recipe, Save recipe, Add to list, Mark complete.
- Avoid culinary puns in error messages.
- Use sentence case throughout.
- Keep helper text under 120 characters when possible.
- Never imply a scraped recipe belongs to PerfectPlate; preserve and display source attribution.

## Source-to-decision table

| Reference | Observed evidence | PerfectPlate decision |
|---|---|---|
| RecipeSage | Green primary, dark food hero, compact app preview, practical feature cards | Use sage as the brand anchor and let food imagery provide richness; keep product surfaces lighter and more original |
| Shopify Admin/login | Compact neutral controls and centered auth card; official docs specify persistent sidebar, top search, alerts, home metrics, and urgent tasks | Use a stable sidebar/top-bar app shell, command search, actionable dashboard cards, and focused authentication |
| Plan to Eat | Recipe → plan → shop narrative, blue/coral contrast, editorial type, app previews | Make the workflow visible and use a restrained warm accent for import and activation moments |
| Mealime | Large whitespace, friendly illustrations/food motifs, sequential feature sections, bright green actions | Use generous rhythm, clear single-purpose sections, and approachable empty states without copying its illustrations |
| Samsung Food | Bold black hierarchy, orange accents, alternating feature rows, direct top navigation | Use strong page titles, high-contrast content hierarchy, and navigation aligned to Recipes, Planning, and Grocery tasks |
| Shopify official admin docs | Sidebar sections, global search, top-bar utilities, task-driven home page, pinnable destinations | Prioritize repeat navigation and resumable work instead of a marketing-style dashboard (**inferred**) |

## Next.js, Tailwind, and shadcn/ui build instructions

1. Use Next.js App Router with route groups for `(marketing)`, `(auth)`, and `(app)`.
2. Keep the authenticated shell in a shared `(app)/layout.tsx` so sidebar and top-bar state survive navigation.
3. Use server components for static shells and metadata; add client components only for Convex subscriptions and interaction.
4. Configure Manrope and Fraunces with `next/font/google` and expose them as CSS variables.
5. Map the color tokens above to shadcn semantic variables in `globals.css`; do not scatter raw hex values through components.
6. Extend Tailwind only for the documented spacing, radii, shadows, breakpoints, and font families.
7. Start with shadcn `Button`, `Input`, `Card`, `Dialog`, `Sheet`, `DropdownMenu`, `Command`, `Badge`, `Checkbox`, `Skeleton`, `Toast/Sonner`, `Tabs`, and `Tooltip`.
8. Wrap primitives in product components such as `RecipeCard`, `ImportProgress`, `GroceryItemRow`, `AppSidebar`, and `EmptyState`.
9. Use Lucide icons with a consistent 1.75–2px stroke. Do not mix icon families.
10. Use `next/image` with explicit dimensions and responsive `sizes`; preserve source attribution for imported recipe images.
11. Keep filters and search state in URL parameters. Use Convex pagination for growing collections.
12. Build mobile layouts alongside desktop layouts, not as a final retrofit.
13. Implement state examples in isolation before connecting data: empty, loading, populated, validation failure, backend failure, and offline/reconnecting.
14. Add Playwright coverage later for the critical flows: sign in → email recipe → review → save to Recipe Book → add ingredients → edit/check grocery item; and discover → save suggestion.

### Suggested route map

```text
/
/sign-in
/sign-up
/app
/app/discover
/app/recipe-book
/app/recipe-book/[recipeId]
/app/imports
/app/subscriptions
/app/grocery-lists
/app/grocery-lists/[listId]
/app/settings
```

### Suggested component organization

```text
components/
  app-shell/
  discovery/
  recipe-book/
  grocery/
  imports/
  subscriptions/
  feedback/
  ui/
```

## Definition of design-complete

The frontend implementation matches this design document when:

- Desktop and mobile navigation are both usable with keyboard and touch.
- Every specified page has empty, loading, success, validation, and failure behavior.
- The main flow can be understood without onboarding copy.
- Email recipe intake, intent-based discovery, Recipe Book saving, blog subscriptions, and grocery editing are visible as first-class navigation and route concepts.
- Recipe source attribution remains visible.
- Brand tokens are centralized and raw color values are not duplicated across feature components.
- No third-party source logos, screenshots, illustrations, photography, or copy ship in the product.
- The full sign-in → email recipe → Firecrawl extraction → Recipe Book → editable grocery-list flow passes an accessibility and responsive review.

## Rerun inputs

```yaml
workflow: firecrawl-website-design-clone
source_urls:
  - https://recipesage.com/
  - https://admin.shopify.com/store/dg3rcj-v1?welcome
  - https://www.plantoeat.com/
  - https://www.mealime.com/
  - https://samsungfood.com/
target_stack: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
output: DESIGN.md
```
