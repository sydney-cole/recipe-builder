## Purpose

Defines a trustworthy, authenticated path for bringing recipe links into PerfectPlate and following each import until it can be reviewed or recovered.

## ADDED Requirements

### Requirement: Import-first entry experience
The system SHALL make recipe importing the primary action for an authenticated user who has no saved recipes or imports, and SHALL derive authenticated dashboard activity from persisted user data rather than sample counts or fictional events.

#### Scenario: New user reaches the authenticated home
- **WHEN** an authenticated user has no saved recipes and no imports
- **THEN** the home experience prominently offers URL import, identifies the shared site inbox as an optional capture method when the account email is verified, and does not display fictional recipe or import activity

#### Scenario: Deferred features remain visible
- **WHEN** a user visits Discover or Subscriptions during this release
- **THEN** the system clearly identifies the feature as a preview and does not present local sample changes as persisted account data

### Requirement: Authenticated recipe intake
The system SHALL allow an authenticated user to create an import from a valid HTTP or HTTPS recipe URL by submitting it directly, and SHALL use one site-wide AgentMail inbox as an optional intake channel rather than provisioning or connecting an inbox per user.

#### Scenario: User submits a recipe URL
- **WHEN** an authenticated user submits a valid supported recipe URL
- **THEN** the system records a user-owned import and immediately displays it in the user's recent imports

#### Scenario: Shared inbox address is presented
- **WHEN** an authenticated user with a verified account email chooses the email capture method
- **THEN** the system displays the configured site-wide inbox address and does not offer inbox provisioning or connection controls

#### Scenario: Submitted URL is invalid
- **WHEN** a user submits a value that is not a valid supported HTTP or HTTPS URL
- **THEN** the system rejects the request with an actionable validation message and creates no import

#### Scenario: Intake is attempted without authentication
- **WHEN** an unauthenticated caller attempts to submit a recipe URL through the application
- **THEN** the system denies the operation and creates no user-owned data

### Requirement: Shared inbox messages are assigned by verified sender
The system SHALL accept AgentMail events only for the configured site-wide inbox and SHALL assign recipe links to a user only when the normalized `message.from` address uniquely matches that user's verified PerfectPlate account email.

#### Scenario: Verified account holder emails recipe links
- **WHEN** a verified AgentMail event for the configured site-wide inbox contains valid recipe links and its normalized sender uniquely matches a verified account email
- **THEN** the system creates user-owned imports for the new links and retains only safe originating-email context needed by the experience

#### Scenario: Sender cannot be safely assigned
- **WHEN** the normalized sender is unknown, belongs to an unverified account, or does not resolve to exactly one account
- **THEN** the system creates no user-owned import and records a safe internal disposition without revealing account information

#### Scenario: Event targets another inbox
- **WHEN** a verified AgentMail event identifies an inbox other than the configured site-wide inbox
- **THEN** the system ignores or rejects the event and creates no import

#### Scenario: Shared inbox event is not authentic
- **WHEN** an inbound request fails AgentMail webhook verification
- **THEN** the system rejects the request before parsing links or resolving a sender

### Requirement: Recipe drafts are generated from retrieved source content
The system SHALL retrieve the submitted recipe page with Firecrawl and SHALL use the OpenAI Responses API with schema-constrained Structured Outputs to create a recipe draft from that retrieved content before the import becomes ready for review.

#### Scenario: Source retrieval and draft generation succeed
- **WHEN** Firecrawl returns usable page content and OpenAI returns a recipe draft matching the required schema
- **THEN** the system validates and persists the draft with source and generation provenance and marks the import ready for owner review

#### Scenario: Source omits an optional value
- **WHEN** the retrieved content does not state an optional recipe value
- **THEN** the generated draft leaves that value absent or null rather than inventing it

#### Scenario: Retrieved content contains instructions for the model
- **WHEN** page content includes text that attempts to redirect or instruct the generation process
- **THEN** the system treats that text as untrusted source data and generates only fields supported by the recipe schema and recipe source

#### Scenario: OpenAI does not return a usable draft
- **WHEN** OpenAI refuses the request, returns an incomplete response, violates application bounds, or reports a provider failure
- **THEN** the import enters a safe categorized failure state and is retryable only when the failure category permits it

#### Scenario: Generated draft awaits human approval
- **WHEN** a valid generated draft is persisted
- **THEN** the system does not add it to the Recipe Book until its owner reviews and explicitly saves it

### Requirement: Observable import lifecycle
The system SHALL expose a user-facing lifecycle that distinguishes waiting, source retrieval and draft generation in progress, ready for review, saved, and failed imports and SHALL keep the displayed state current without requiring a page refresh.

#### Scenario: Processing succeeds
- **WHEN** source retrieval and draft generation produce the required recipe content
- **THEN** the import becomes ready for review and offers a direct action to open its review page

#### Scenario: Processing is still running
- **WHEN** an import is waiting, retrieving its source, or generating its draft
- **THEN** the interface communicates the current non-terminal state and prevents duplicate start actions

#### Scenario: Processing fails
- **WHEN** source retrieval or draft generation reaches a terminal failure
- **THEN** the import displays a safe, actionable explanation and offers retry when the failure is recoverable

### Requirement: Safe retry and deduplication
The system SHALL make import creation and processing idempotent for the same user and normalized source URL and SHALL preserve attempt history needed to explain retries.

#### Scenario: User submits a URL already in their imports
- **WHEN** a user submits a source URL equivalent to an existing import they own
- **THEN** the system returns the existing import rather than creating a duplicate

#### Scenario: User retries a recoverable failure
- **WHEN** the owner retries a failed import that is eligible for retry
- **THEN** the system starts one new attempt, clears the stale user-facing error, and exposes renewed progress

#### Scenario: Provider event is delivered more than once
- **WHEN** the same verified inbox event is received repeatedly
- **THEN** the system processes the event idempotently and does not create duplicate imports

### Requirement: Import ownership and safe errors
The system SHALL restrict import details, review links, and retry actions to the owning user and SHALL not expose provider credentials, raw webhook payloads, or internal exception details in user-facing errors.

#### Scenario: User requests another user's import
- **WHEN** an authenticated user requests an import they do not own
- **THEN** the system returns no import data and offers no action on it

#### Scenario: Provider rejects an extraction
- **WHEN** Firecrawl, OpenAI, or AgentMail returns a detailed error containing internal or sensitive information
- **THEN** the user sees a safe categorized message while diagnostic detail remains server-side
