# Shared capture API and MCP — issues #46 and #27

## Intent and authority

The owner requested implementation of the previously described flow: natural
language request, AI interpretation, validated proposal, explicit approval,
atomic save and verification. ChatGPT/Claude MCP and the site's eventual AI
assistant use one service. No mandatory manual book form or model call is added.

Build on main `eb16fca`, Nuxt/Nitro, Better Auth 1.7.7, published Biome and the
existing schema. Use synthetic data only. This is implementation authorization,
not hosted migration, credential, permission activation or cutover approval.
The Sheet remains canonical. Imported books cannot be mutated by this slice.

## Approach

Use narrow SQL routines behind a shared server service, with browser-session
HTTP adapters and OAuth MCP adapters. Separate writer implementations would
diverge in authorization/replay behavior. Direct model-to-SQL access would bypass
the reviewed contract. Keep the existing host, identity and database.

### Mutation contract

`BookChange` is a closed union:

- Create: `type: 'create'`, `title` (1–500 characters), `authors` (1–16 unique
  names, 1–200 characters each), `platform`, `status`; optional `rating`,
  `opinion`, `notes`, `finishedDate`.
- Update: `type: 'update'`, `stableId` (1–500), `expectedVersion` (positive
  PostgreSQL bigint decimal string), `expectedFeedbackVersion` (same or null),
  `patch` with at least one of `platform`, `status`, `rating`, `opinion`, `notes`,
  `finishedDate`.

Platforms are Audible/Kindle/Physical/Unknown. New statuses are
wishlist/unread/reading/paused/read. Ratings are finite numbers 1–5 in half steps,
or explicit null. Opinion is at most 4000 characters; notes at most 10000;
nullable feedback clears only on explicit request. Finished dates are valid
absolute YYYY-MM-DD dates and require resulting status read. Never infer a date,
rating or opinion. Missing properties preserve existing fields. No generated
assessment, ownership, ranking, source timestamp, raw relation ID or SQL field
can be written through this contract. Duplicate normalized author names fail.

Public domain types/validators are framework-free. SQL independently validates
the same closed payload. Whole mutation bodies are capped at 32 KiB.

### Persistence and confirmation

Migration 0011 adds private native-write permissions, explicit native-book
markers and proposal storage. No existing book is marked native. Absent/disabled
per-library permission means writes disabled. Only an offline owner operation
can enable native writes; no runtime permission-management endpoint exists.

Routines derive a verified application's library from the trusted server actor.
Prepare is idempotent by actor/request/content and returns immutable normalized
change, current values, digest and 30-minute expiry. Preparing never changes a
book. Return the parent and independent feedback versions on editable reads.

A client-provided confirmation boolean is insufficient. The MCP prepare tool
returns a same-origin review URL. A verified browser session displays the exact
stored proposal and submits an origin-checked approval. That server-only action
records approval and commits atomically. MCP cannot call the browser confirmation
action with a bearer token. A later MCP commit call can retrieve/replay the
approved result, but cannot create confirmation. The reader clicks approval;
they do not re-enter structured data.

Commit accepts proposal ID and exact digest, not replacement content. Validate
ownership, permission, confirmation, expiry and expected parent/feedback versions.
Exact retries return the original receipt; changed request reuse fails. Retain
proposal/receipt history. No-op edits preserve timestamps, provenance and versions.
Cross-user, archived and imported subjects are denied without foreign metadata.

Use existing import gate `(73421,2)`, request `(73423,...)` and library context
`(73422,...)` locks, then sorted books and children. Recheck authorization after
waiting and before receipt replay. Reuse immutable app receipts; do not invoke
the globally scoped legacy owner routines. All new functions have fixed search
paths, PUBLIC revocation and narrow runtime EXECUTE grants. Runtime has no base
table access. Authenticated application IDs supply user provenance, not the
shared SQL login. Insert/reuse author names without renaming shared metadata.

### Shared service and HTTP

Keep runtime service code in `apps/web/server/core` so Nuxt never imports offline
database/importer modules. `LibraryService` takes a query pool and offers scoped
search/detail/reading, prepare, proposal lookup, browser approval+commit and
confirmed commit methods. API/MCP cannot supply actor/library ownership fields.

Browser routes: POST `/api/private/changes`, GET `/api/private/changes/:id`, POST
`/api/private/changes/:id/confirm`, and versioned GET
`/api/private/editable-books/:stableId`. POST requires exact configured Origin
and persisted verified session. Strict bodies, bounded reads, no-store and
sanitized errors apply. `/library/changes/:id` is an accessible confirmation
screen with approve/cancel; it never runs an AI model.

### OAuth and MCP

Use `@better-auth/oauth-provider` 1.7.7 with the existing Better Auth instance;
opaque hashed tokens, authorization code + S256 PKCE, explicit read/write scopes
and audience bound to the exact `/mcp` resource. Do not add Netlify Identity,
shared passwords, a second auth database or a custom OAuth cryptographic flow.
No offline_access in the initial slice. Validate stored token/client/session and
verified user on every MCP request; sessionless or revoked credentials fail.

Version migration 0012 from the actual pinned provider schema, never runtime
migration. Provider routing is explicitly opt-in through server configuration
and disabled by default, preserving current Google sign-in before deployment.
Publish standard authorization and protected-resource discovery. Preserve the
provider's signed oauth_query through Google login, then an explicit consent
screen. Registration and redirects follow provider validation and bounded input.

Use official MCP SDK 1.32.2, stateless Web-standard Streamable HTTP JSON transport
at `/mcp`; no long-lived in-memory sessions. Register `search_books`, `get_book`,
`list_reading`, `prepare_change`, `get_change`, `commit_change`. Thin handlers use
the shared service. Mutations require library:write; reads require library:read.
Require both for proposals exposing current data. Tool annotations describe side
effects and the review/approval flow. Invalid tokens get a discovery challenge;
errors/headers never expose driver, credential, prompt or foreign-book details.

## Acceptance and release boundary

Tests cover strict payloads, impossible dates, duplicate names, no-op/replay,
foreign/archived/imported subjects, disabled permissions, stale independent
versions, expiry, mutated proposals, forged confirmation, rollback and competing
commits. Real synthetic PostgreSQL proves privileges, provenance and integrity.
SDK protocol tests exercise initialize/list/call, scopes and malformed requests.
OAuth tests exercise metadata, PKCE/redirect validation, consent and token
expiry/revocation/session liveness without contacting Google. Browser tests
exercise the review screen without real records.

Run pnpm check, test:db and relevant test:e2e; keep isolated checks separate if
local private-package installation remains blocked. Fresh independent review
precedes integration. Hosted schema application, explicit native permission,
provider activation and actual ChatGPT/Claude acceptance remain separate concrete
release operations. Neither issue is completed by local transport tests alone.
