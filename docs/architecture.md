# Architecture

The `web` application composes `ui` and fetches the diagnostic health endpoint through
`data-access`. `domain` owns the framework-free `HealthResponse` contract. The API function
is separate from browser code and returns no personal data.

Nx tags enforce the allowed direction: web → ui/data-access/domain,
data-access → domain, ui → domain, and api → domain. `libs/ai` is documentation only until a
separately approved AI capability needs a real boundary.

## Database delivery boundaries

The [database delivery pack](database/plans/README.md) adds api → database/domain,
database → domain, and importer → database/domain. DB-01 implements the database edge;
DB-02 implements the importer edge and pure import DTOs in domain. Browser web/data-access/ui cannot import either
server-only project; browser calls use HTTP DTOs from domain. No migrations run at build or startup.

## DB-01 local server boundary

`libs/database` is tagged `scope:database` and depends only on domain DTOs. API may depend
on database/domain; web, UI and data-access cannot import it. The `scope:importer`
edge is importer → database/domain, without changing frontend edges. SQL migrations and
owner operations remain local, server-only infrastructure; they are not invoked by the API,
frontend bundle, build or startup. Unit tests run in `pnpm check`; actual PostgreSQL tests
are a separate required database workflow. See [local development](database/runbooks/local-development.md).

## DB-02 local import boundary

`libs/importer` is server-only tooling, tagged `scope:importer` and `type:server`.
ExcelJS is a development dependency used by extraction; it cannot enter browser code.
Pure evidence and report DTOs live in domain. The database library exports marked-local
connection inspection; test harness access uses the explicit database/testing alias.
The importer stages every tab but applies only the core scope. Later scopes remain gated.
No extraction, import, migration or verification runs during build/API startup.
See the [core import runbook](database/runbooks/core-import.md).

## Target architecture (M1 onward)

Current state above stays true until M1 replaces `apps/web` (React) and `apps/api` with the Nuxt app.
Source: [takeover design](superpowers/specs/2026-10-04-smart-library-takeover-design.md) §4.

### Projects

| Project                      | Responsibility                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web` (Nuxt 4)          | `app/`: pages and components. `server/`: thin Nitro routes for `/api/*` (public), `/api/private/*` (session), `/mcp` (OAuth bearer), `/api/health`, `/api/health/db`, `/.well-known/oauth-protected-resource`, and a catch-all returning 404 for unknown `/api/**` |
| `apps/jobs` (new)            | Netlify Scheduled Functions for community ratings and author highlights; call `library-service` directly; built with the existing esbuild script pattern                                                                                                           |
| `apps/api`                   | Removed once `apps/web` reproduces its URLs and e2e behavior                                                                                                                                                                                                       |
| `libs/domain`                | Framework-free DTOs and literal enums shared by browser and server                                                                                                                                                                                                 |
| `libs/ui`                    | Smart Library Vue compositions on `@thijulio/biome-vue`                                                                                                                                                                                                            |
| `libs/database`              | Existing (DB-01): migrations, routines, SQL access; server-only                                                                                                                                                                                                    |
| `libs/importer`              | Existing (DB-02): extended to quotes, recaps, highlights, series catalog and comparison events                                                                                                                                                                     |
| `libs/library-service` (new) | Use cases (`finishBook`, `recordFeedback`, `castVote`, `saveRecap`, …) over DB routines; the only business-logic layer for the browser API, MCP and jobs                                                                                                           |
| `libs/ranking` (new)         | Port of the prototype's Bradley–Terry engine and pair scheduler                                                                                                                                                                                                    |
| `libs/mcp` (new)             | MCP tool definitions as thin adapters over `library-service`                                                                                                                                                                                                       |
| `libs/ai`                    | Server-only Playground provider clients                                                                                                                                                                                                                            |
| `libs/data-access`           | Removed; Nuxt `useFetch` with `libs/domain` DTOs replaces it                                                                                                                                                                                                       |

### Rules

1. **Browser/server separation.** Files under `apps/web/app/**` must not import server-only libs
   (`database`, `importer`, `library-service`, `ranking`, `mcp`, `ai`). Enforced by an ESLint
   override and by the existing bundle scanner run against `.output/public`.
2. **Database access.** Public reads use the Neon HTTP driver with the public-reader credential
   against `api_public` views only. Each write use case runs in exactly one transaction on the
   Neon WebSocket driver with the editor credential, following the lock order of execution
   contract F. `pg` and direct connection URLs are used only by offline tools (migrations,
   imports, backups) and never reach a function.
3. **Privacy and caching.** Public pages are server-rendered from public data only. Editor, Book
   Battle and Playground pages are client-rendered and fetch only from `/api/private`, which
   responds with `Cache-Control: private, no-store`. No `cache`, `swr` or `isr` route rule may
   apply to a route that renders private data. An e2e test asserts that private sentinel values
   never appear in public HTML or `_payload.json`.
4. **URL contract.** `/api/health`, `/api/health/db` and the 404 for unknown `/api/*` keep their
   current behavior; the existing e2e HTTP tests remain the acceptance check.
5. **Spikes before reliance.** A stateless MCP endpoint on Nitro/Netlify within the function
   timeout, and the Better Auth OAuth flow with both ChatGPT and Claude, are proven in M0, before M1 builds on Nuxt.
