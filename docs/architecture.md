# Architecture

## Implemented private product slice

`apps/web` is one Nuxt application. `app/` contains Vue pages, components and
client state; `server/` contains Nitro HTTP adapters and auth/read helpers. The
old React application, separate diagnostic API application, `libs/ui` and
`libs/data-access` foundation are removed. Their health contracts are preserved
inside Nitro and covered by local HTTP tests.

`libs/domain` contains framework-free health and book DTOs. `libs/database` and
`libs/importer` remain offline server-only tooling. They are never imported by
browser or runtime HTTP code and never run during builds/startup. The database
execution contracts still govern imports, provenance and immutable migrations.

Nx keeps web → domain, database → domain and importer → database/domain. ESLint
also forbids browser files importing server modules, database drivers or offline
libraries. The bundle scanner inspects the actual `dist/apps/web/public` bytes
for SQL, server modules and credential identifiers.

## Authentication and ownership

The anonymous page explains the product and makes no library requests. Google
is the first identity provider; ownership keys are Better Auth application user
IDs, independent of Google subjects/emails. Any verified account can register.
New accounts have an empty private library and never claim the existing import.
Other providers can be added later with an explicit account-linking policy.

Better Auth uses the `auth` schema through a Kysely PostgreSQL adapter and the
Neon WebSocket pool. Tokens are encrypted at rest and sessions use secure cookies;
server reads validate the current persisted session without cookie caching.
Google sign-in is pinned to identity scopes and product callbacks. Only the
implemented sign-in/callback/sign-out auth routes are exposed. Sign-out confirms
persisted revocation before reporting success; upstream errors propagate to a
sanitizing boundary before fallback logging. Each request closes its Neon pool. Server-only
configuration has no client/public counterpart or fallback administrator URL.

Migration 0006 adds `user_libraries` and exclusive `library_books` membership
without changing imported IDs, values, feedback or provenance. The trusted server
passes only the session's user ID to `catalog_for_user`/`book_for_user`; client
ownership parameters are ignored. A foreign book returns 404. The runtime login
has auth CRUD and scoped function execution, with no base library/audit access,
writer operations, DDL or owner membership. Offline owner binding requires a
verified user, refuses reassignment and never runs during signup/build/startup.

## Privacy, routing and builds

The public home is server-rendered. `/library` and its children are rendered on
the client and load private HTTP DTOs. `/api/private/**`, `/api/auth/**` and private
pages send `Cache-Control: private, no-store, max-age=0`. No private route uses
SWR/ISR caching. Errors are sanitized; driver details and credentials are not logged.

`/api/health`, `/api/health/db`, method rejections and JSON 404s for unknown API
paths retain their contracts. Netlify uses the generated Nitro function routing,
without the old React SPA fallback. Node and Netlify presets share the same
product source; build caching includes `NITRO_PRESET`.

`pnpm build` produces `dist/apps/web/server/index.mjs` and public assets.
`pnpm build:netlify` produces `.netlify/functions-internal/server/server.mjs` and
`dist/apps/web/public`. Neither build runs migrations, imports or owner binding.

## Remaining capabilities

Editing, Book Battle/ranking, enrichment imports, MCP, jobs and AI remain future
milestone work. Runtime user-scoped writes need their own contract; historical
broad editor/importer credentials are not available to the product runtime.
Published Biome CSS is consumed directly; shared Vue components can be adopted
when the package is available without copying component or token source.

Owner decisions [T-13 and T-14](product/decisions.md) replace the standalone spike
and single-owner/public-catalog assumptions. Reuse the existing imported Neon
production database and Netlify site. All hosted changes and live validation
remain concrete approval gates. The Google Sheet stays canonical until cutover.
