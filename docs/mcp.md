# Shared book changes and MCP

Smart Library's browser API and MCP adapter use one scoped library service and
one PostgreSQL writer. A caller prepares a structured proposal, the reader
reviews its exact stored content in a signed-in browser, and the approval action
commits the change atomically. MCP cannot approve a proposal.

This describes implemented code, not a deployed capability. Hosted application
of migrations `0011_native_book_changes.sql` and `0012_mcp_oauth.sql`, deployment,
OAuth activation, offline native-write permission and acceptance in actual
ChatGPT/Claude clients remain separate release actions requiring owner approval.
The Google Sheet remains canonical. Imported books remain nonwritable; this work
does not perform or authorize a cutover.

## Authority and supported changes

The server derives the application actor from a verified persisted browser
session or validated OAuth token. Requests cannot select an owner or library.
Users must already have a library; this interface does not bind imported books,
create another identity model or grant write permission.

An absent or disabled row in `library.native_write_permissions` denies native
writes. Only a reviewed offline owner operation may change this per-library
permission; there is no runtime management endpoint or global native-write flag.
That operation must follow the documented import-gate/library-context lock order.
Installing the migration does not enable any library. New books receive explicit
native markers; existing books are never backfilled. A marker accompanied by
import evidence does not authorize a write.

`BookChange` is a closed union. Unknown fields fail validation in the domain and
again in SQL. Create requires `type`, `title`, ordered unique `authors`,
`platform` and `status`. Optional fields are `rating`, `opinion`, `notes` and
`finishedDate`. Update requires `type`, `stableId`, `expectedVersion`,
`expectedFeedbackVersion` and a nonempty `patch`; the patch accepts only
`platform`, `status`, `rating`, `opinion`, `notes` and `finishedDate`.

- Platforms: `Audible`, `Kindle`, `Physical`, `Unknown`.
- Writable statuses: `wishlist`, `unread`, `reading`, `paused`, `read`.
- Titles: 1–500 characters; 1–16 author names, each 1–200 characters. Names
  duplicate after trimming, NFC normalization and lowercasing are rejected.
- Ratings: finite numbers from 1 to 5 in half steps, or explicit `null`.
- Opinion: at most 4000 characters; notes: at most 10000. Explicit `null` clears
  feedback; omitted properties preserve existing values.
- Finished dates: valid absolute `YYYY-MM-DD`, or `null` to clear. A resulting
  finished date requires status `read`. Never infer a date, rating or opinion.
- Versions: positive PostgreSQL bigint decimal **strings**, never JS numbers.
  `expectedFeedbackVersion: null` means no feedback row currently exists.
- Mutation request bodies: at most 32 KiB. No raw relation IDs, SQL fields,
  ownership fields, generated assessments, ranking or source metadata.

Author lookup rows may be reused or inserted without renaming shared metadata.
Book and feedback versions advance independently. A no-op preserves versions,
timestamps and provenance. SQL records the authenticated application actor,
never the shared database login.

## Browser API and DTOs

Private endpoints require a verified persisted browser session. POSTs also
require JSON and an `Origin` exactly matching configured `BETTER_AUTH_URL`.
Responses are private and use `Cache-Control: no-store`.

| Method | Endpoint                                | Request / response                                                   |
| ------ | --------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/private/editable-books/:stableId` | `{ book: EditableBook }`                                             |
| POST   | `/api/private/changes`                  | `{ requestId, change: BookChange }` → `{ proposal: ChangeProposal }` |
| GET    | `/api/private/changes/:id`              | `{ proposal: ChangeProposal }`                                       |
| POST   | `/api/private/changes/:id/confirm`      | `{ requestId, digest }` → `{ receipt: ChangeReceipt }`               |

Synthetic create request:

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174001",
  "change": {
    "type": "create",
    "title": "A Synthetic Journey",
    "authors": ["Example Writer"],
    "platform": "Kindle",
    "status": "unread"
  }
}
```

Synthetic update request, after reading the current independent versions:

```json
{
  "requestId": "123e4567-e89b-42d3-a456-426614174002",
  "change": {
    "type": "update",
    "stableId": "synthetic-book-id",
    "expectedVersion": "1",
    "expectedFeedbackVersion": null,
    "patch": { "status": "read", "finishedDate": "2026-10-30", "rating": 4.5 }
  }
}
```

Public DTOs live in `libs/domain/src/lib/book-change.ts`:

```ts
type EditableBook = {
  stableId: string;
  title: string;
  authors: string[];
  platform: 'Audible' | 'Kindle' | 'Physical' | 'Unknown';
  status: 'wishlist' | 'unread' | 'reading' | 'paused' | 'read' | 'reread' | 'abandoned';
  rating: number | null;
  opinion: string | null;
  notes: string | null;
  finishedDate: string | null;
  version: string;
  feedbackVersion: string | null;
  native: boolean;
  writable: boolean;
};
type ChangeReceipt = {
  proposalId: string;
  stableId: string;
  version: string;
  feedbackVersion: string | null;
  appliedAt: string;
  changed: boolean;
};
type ChangeProposal = {
  id: string;
  digest: string;
  change: BookChange;
  before: EditableBook | null;
  expiresAt: string;
  state: 'pending' | 'expired' | 'committed';
  receipt: ChangeReceipt | null;
};
```

`before` is null for creates. Timestamps use UTC ISO strings. The digest binds the
stored change and its preparation channel; use the returned value unchanged.
Proposals expire after 30 minutes. Confirmation accepts an ID and digest, never
replacement content or a client confirmation boolean. A stale book or feedback
version fails without saving or retaining confirmation. Prepare a fresh proposal
and review it again; do not silently update expectations.

The review page is `/library/changes/:id`. Its approve action calls the browser
confirmation endpoint and saves in the same transaction. Cancel leaves the book
unchanged. A later proposal GET exposes the committed receipt. Retrying a commit
for the same committed proposal returns its original receipt, including with a
new commit request UUID. Reusing an actor/operation/request UUID for different
content fails. Keep the same request identity when recovering an unknown result.

## MCP connection and tools

The MCP resource is the configured origin plus `/mcp`. It uses the official SDK's
stateless Streamable HTTP transport with JSON responses; no persistent server
session is required. Do not send a browser cookie as an MCP credential.

OAuth is opt-in: `MCP_OAUTH_ENABLED=true` enables the provider in the existing
Better Auth instance. Unset, `false` or any value other than the exact string
`true` leaves it disabled. Existing Google sign-in remains the login mechanism;
this switch does not grant native-write authority.

When enabled, discover configuration through:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-authorization-server/api/auth`

Use authorization code flow with S256 PKCE, the provider's validated registered
redirect and explicit consent. Preserve the signed `oauth_query` through
`/oauth/login` and `/oauth/consent`; do not construct a replacement consent query.
The requested resource/audience must exactly match the configured `/mcp` URL.
Tokens are opaque, stored hashed, and expire after one hour. There are no refresh
tokens or `offline_access` in this slice: reconnect and authorize again after
expiry. Revoked tokens, revoked/expired login sessions and unverified users fail
validation on each MCP request.

| Tool             | Arguments                   | Required scopes / behavior                                                  |
| ---------------- | --------------------------- | --------------------------------------------------------------------------- |
| `search_books`   | `{ query }`                 | `library:read`; search the user's library                                   |
| `get_book`       | `{ stableId }`              | `library:read`; read one owned book                                         |
| `list_reading`   | `{}`                        | `library:read`; current reading                                             |
| `prepare_change` | `{ requestId, change }`     | Both scopes; return proposal plus same-origin `reviewUrl`; no book mutation |
| `get_change`     | `{ id }`                    | Both scopes; read proposal and receipt                                      |
| `commit_change`  | `{ requestId, id, digest }` | Both scopes; retrieve/replay a browser-approved receipt; cannot confirm     |

`get_book` includes `version`, `feedbackVersion`, `native` and `writable`, alongside
the current editable values. For an update, copy those versions into
`expectedVersion` and `expectedFeedbackVersion`; do not guess or increment them.
Imported records report `writable: false`.

A typical MCP interaction prepares the change, asks the reader to open
`reviewUrl`, and waits for approval there. After approval, `get_change` or
`commit_change` retrieves the receipt, and `get_book` verifies the saved book.
Calling `commit_change` before browser approval fails. A bearer token cannot
invoke the browser approval endpoint in place of its session and Origin checks.
Do not interpret tool discovery or local SDK tests as proof that a hosted client
has completed OAuth or saved a book.

For the dated production preflight, exact pending migration manifest and staged
activation/reversal procedure, see the [activation runbook](database/runbooks/mcp-activation.md).

## Release checks

Before any approved hosted activation:

- Review and approve the concrete hosted migrations, runtime function grants,
  deployment and configuration separately. Never run migrations at build/startup.
- Preserve the existing runtime login and strict ownership checks. Runtime gets
  narrow routine EXECUTE permissions, with no direct access to native permission,
  native marker or proposal tables and no legacy broad writer grants.
- Keep OAuth disabled until migration 0012, exact HTTPS origin, discovery,
  registered redirects, PKCE and consent are verified. Keep credentials and tokens
  out of logs, prompts, browser bundles, Git and synthetic fixtures.
- Keep native permissions disabled until an explicit offline per-library decision.
  Test that an imported book remains nonwritable and no imported values or Sheet
  data change. Native permission is not cutover approval.
- Verify stale versions, expired proposals, changed request reuse, wrong digests,
  cross-user access, revoked tokens/sessions and unapproved commits fail safely.
  Verify competing approvals create one result and retries recover its receipt.
- Run repository checks, real synthetic PostgreSQL integration tests and browser
  tests. Record environment/package blockers rather than claiming full acceptance
  from isolated tests.
- Complete an explicitly approved end-to-end hosted acceptance with actual
  ChatGPT and Claude clients: connect, consent, read, prepare, browser approve,
  retrieve receipt and verify saved values. This remains a release gate.

No hosted migration, permission, credential, OAuth activation, deployment or
cutover is implied by this guide. Retain proposal/receipt and app-native history
when planning any later rollback or switchback.
