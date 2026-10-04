# Thiago Smart Library — takeover and delivery design

Date: 2026-10-04. Status: approved in conversation section by section; pending written-spec review.

This document records where the project stands after the move from ChatGPT/Codex to Claude Code,
the decisions taken during the takeover, the target architecture, and the milestone sequence to
replace the Thiago Library prototype and retire its Google Sheet.

## 1. Goal and success criteria

Smart Library replaces the prototype (`thijulio/thiago-library`) when both are true:

1. It offers every prototype capability (parity list in §6.1), and
2. The Google Sheet is no longer written to by anyone or anything.

Daily data entry keeps working through AI assistants: ChatGPT and Claude write to Smart Library
through a remote MCP server. A browser editor covers manual fixes, archiving and Book Battle.

The product principles of the private product thesis remain in force: records survive AI outages,
AI output is grounded and distinguishable from owner-authored content, inferred preferences are
reviewable, and enrichment never blocks recording an action.

## 2. Verified starting point (2026-10-04)

| Area                                                    | State                                                                                                                                 | Evidence                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `main` (`3841213`)                                      | L1 shell: React welcome page, `/api/health`, `/api/health/db`                                                                         | Repository inspection                                           |
| `thijulio/database-context` (DB-00)                     | Sanitized DB spec, execution pack, prototype references                                                                               | Pushed 2026-10-04 as backup; no PR                              |
| `thijulio/database-schema` (DB-01)                      | 4 migrations; `library`, `import_audit`, `api_public`, `db_meta` schemas; 6 NOLOGIN roles; version-checked, idempotent owner routines | `pnpm test:db`: 7 files, 87/87 passed against PostgreSQL 16     |
| `thijulio/database-import` (DB-02)                      | Lossless XLSX snapshot, normalization, three-way merge, transactional apply, verify; main tab only; migration `0005`                  | Pushed as backup                                                |
| `thijulio/database-import-wip`                          | Unreviewed fixes from the 2026-10-03 audit plus a persistent local target                                                             | `pnpm test:db` including these changes: 9 files, 126/126 passed |
| PR #20 (`thijulio/product-roadmap-docs`)                | Product/roadmap docs, issues #4–#19, "ChatGPT-only" AI decision                                                                       | Open; superseded in part by §3                                  |
| Golden Path branches `database-context/-schema/-import` | ADR proposals numbered 0005–0007, which collide with ADRs already on Golden Path `main`                                               | Pushed as backup; need rebase and renumbering                   |
| Governance gate                                         | Waits for `@thijulio/governance-core@0.1.0`; source is at 0.2.1, unpublished, distribution moved to vendoring                         | AI Toolbox inspection                                           |
| Prototype                                               | Live; 174 books in the Sheet, 614 comparison events, 79 recaps; no commits since 2026-09-10                                           | Data profile and live audit                                     |
| Local Docker                                            | `smart-library-local` (half-initialized, empty) and the disposable test database are running                                          | `docker ps`, read-only inspection                               |

No real library data has been imported into any Smart Library database.

## 3. Decisions taken during the takeover

| ID   | Decision                                                                                                                                      | Replaces                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T-01 | Claude Code is the only agent driving this project                                                                                            | Codex execution                                                                              |
| T-02 | Replacement means full prototype parity plus Sheet retirement; all features are required before cutover                                       | Undefined end state; DB-05 owner CLI as final interface                                      |
| T-03 | Writes happen through a browser editor and a remote MCP server used from ChatGPT and Claude                                                   | Local owner CLI as the only private write path                                               |
| T-04 | In-app AI: MCP is the primary AI path; the Playground keeps server-side provider keys; Sign in with ChatGPT becomes a post-cutover experiment | P-02 "ChatGPT-only, no platform keys" in PR #20                                              |
| T-05 | Keep DB-01, DB-02 and the WIP; the database structure spec and execution contracts remain the data contract                                   | —                                                                                            |
| T-06 | Frontend: Nuxt 4 (≥ 4.5.2), Vue 3.5, Vue Router 5, Vite 8; start now and upgrade to Nuxt 5 when stable                                        | React 19 web app and `apps/api` functions                                                    |
| T-07 | Biome is consumed through a new published `@thijulio/biome-vue` package                                                                       | `@thijulio/biome-react`                                                                      |
| T-08 | Identity: Better Auth 1.7, self-hosted, with `oauth-provider`, `mcp` and `cimd` plugins; Google login restricted to the owner email           | Netlify Identity (cannot act as an MCP authorization server)                                 |
| T-09 | Privacy: the owner sees everything when signed in; visitors see the catalog view defined by spec §9                                           | Prototype behavior of publishing notes, opinions, ratings, pros/cons, relevance and Why Next |
| T-10 | Deploy previews read a real-data copy on a dedicated Neon branch                                                                              | —                                                                                            |
| T-11 | Golden Path coupling is loose: one exception ADR (PostgreSQL/Neon, Nuxt, Better Auth); contribute reusable findings as separate PRs           | Per-ticket Golden Path obligation                                                            |
| T-12 | Milestones are defined by goals and exit checks, not by time                                                                                  | —                                                                                            |

## 4. Architecture

### 4.1 Runtime and stack

- Netlify: Nuxt through the Nitro Netlify preset, plus Netlify Scheduled Functions for weekly jobs.
  Nitro scheduled tasks are not supported on Netlify.
- Neon PostgreSQL 16-compatible; versioned SQL migrations; no ORM.
- Nx 23.2.1 monorepo, pnpm 10.19.0, Node 24, TypeScript.
- Nuxt ≥ 4.5.2 (includes the fix for the payload-cache disclosure, CVE-2026-71316), Vue 3.5,
  Vue Router 5, Vite 8. Pinia only if client UI state requires it.
- Vitest 4 (Nx 23.2.1 does not yet support Vitest 5), `@nuxt/test-utils` 4.3, `@vue/test-utils`,
  Playwright with axe.

### 4.2 Projects

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

### 4.3 Rules

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
   timeout, and the Better Auth OAuth flow with both ChatGPT and Claude, are proven before M2.

## 5. Environments and transition data flow

| Environment     | Database                                                                 | Data                                  | Writers                                      | Purpose                          |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------- | -------------------------------- |
| Local           | Docker PostgreSQL (disposable test DB; optional persistent private copy) | Synthetic; optional private real copy | Developer                                    | Development, integration tests   |
| CI              | Ephemeral PostgreSQL service                                             | Synthetic only                        | —                                            | Tests                            |
| Deploy previews | Neon branch `preview`                                                    | Real-data copy (T-10)                 | Preview writes only                          | PR review                        |
| Staging         | Neon branch `staging`                                                    | Real data                             | Smart Library UI and a staging MCP connector | Rehearse writes, MCP and cutover |
| Production      | Neon `main`                                                              | Real data                             | Importer only until M5; app and MCP after M5 | Live site                        |

Until cutover the Sheet remains canonical:

- Production is a read model refreshed by the importer: Sheet export → `db:extract` (private
  snapshot outside the repository) → `db:import --dry-run` → owner review → `--apply`. Run
  manually; never during build, deploy or function startup.
- `WRITES_ENABLED=false` in production until M5. Browser and MCP writes run only on staging,
  so there is never a second writer to the canonical data.
- The UI shows data freshness (last applied import).
- Function credentials per Netlify deploy context: public-reader and editor URLs only. Migration
  and import URLs never reach functions. Previews use only `preview`-branch credentials.
- Migrations are applied by explicit command, staging first, then production.

Cutover (M5): rehearse backup and restore, set the Sheet read-only, run the final import and
verification, enable production writes, point assistants and the recaps workflow at the
production MCP connector, make the prototype read-only, retire it, archive a final Sheet export.
Before the first production database write, rollback switches back to the unchanged Sheet; after
it, new database rows are exported and reconciled first (spec §11.3).

## 6. Identity, MCP and privacy

### 6.1 Parity list

Library browse (search, collection/status/platform/series filters, sorts, incremental loading),
book detail (facts, opinion, relevance, notes, quotes, series volumes including missing ones,
same-author books, series progress), Reading and Up Next (Kindle principal/secondary, Audible),
Stats, Favorites ranking (public, shareable), Book Battle (vote, tie, skip, undo), recap reader
(verified/summary/pending/deferred, spoiler warning), editor (all editable fields, archive,
restore, plus create), AI Playground, community ratings job, author highlights job, cover lookup.

### 6.2 Identity

- Better Auth with Google sign-in; only `OWNER_EMAIL` can complete sign-in.
- Better Auth is also the OAuth 2.1 authorization server for MCP (authorization code + PKCE,
  Client ID Metadata Documents, dynamic client registration only for backwards compatibility).
- Access tokens are audience-bound to `/mcp` with scopes `library:read` and `library:write`.
  Revoking a grant in the app stops the assistant immediately.
- Browser sessions use `httpOnly` cookies; no private data in `localStorage` or SSR payloads.
- Better Auth tables live in an `auth` schema and are created through the versioned migration
  runner, not by an implicit runtime migration.

### 6.3 MCP tools

Read: `search_books`, `get_book`, `list_reading`, `list_up_next`, `get_recap`, `get_rankings`,
`get_stats`. Write: `add_book`, `update_book`, `set_status`, `finish_book`, `record_feedback`,
`save_recap`, `add_quote`, `set_up_next`, `archive_book`.

- Write tools require the `expected_version` returned by a read; the server assigns a request ID
  per call so retries are idempotent.
- Tools carry read-only/destructive annotations so clients show the correct confirmations.
- `save_recap` runs the recap validator server-side and returns structured errors on failure.
- Book Battle and the Playground are browser-only.
- MCP responses include private notes and opinions for the owner. Using those tools sends that
  text to the assistant's provider (OpenAI or Anthropic); this is an accepted owner decision.

### 6.4 Visibility

Signed-in owner: every field on every page. Visitors: the spec §9 allowlist (stable ID, title,
ordered authors, series metadata, genres, platform, status, validated cover URL, word count),
validated recaps with approved source metadata, and public ranking order. Notes, opinions,
ratings, pros/cons, relevance, Why Next and comparison details are never public.

## 7. Milestones

| ID                     | Goal                                                               | Scope                                                                                                                                                                                                                                                                                                                                                                                                       | Exit check                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 (parallel)          | Vue components for Biome                                           | `@thijulio/biome-vue` in design-systems, mirroring `biome-react` over `biome-css`; published                                                                                                                                                                                                                                                                                                                | Package published; Smart Library can install it                                                                                                         |
| M0 Takeover            | One source of truth; Codex work on `main`; real data in production | Review and merge DB-00 → DB-01 → DB-02 (+ WIP after review); process reset (§8); replace PR #20 with documents reflecting §3; refresh issues and milestones; update the private context folder; rebase and renumber Golden Path branches and add the exception ADR; inspect Neon, create `staging` and `preview`, migrate, first core import; remove Codex worktrees and containers with owner confirmation | `main` contains the DB work and CI passes; `db:verify` on production reports the imported books; documents agree                                        |
| M1 Read parity         | Visitors see the full catalog from PostgreSQL                      | Nuxt app replaces the React app and `apps/api`; enrichment import (DB-03 scope); comparison events import, ranking port and rebuild (DB-04 read side); public API on allowlisted views; Library, detail, Reading/Up Next (public part), Stats, Favorites, recap reader; freshness indicator; privacy e2e                                                                                                    | Production public site matches the prototype's visitor view minus private fields; rebuilt ranking matches the Sheet ranking within documented tolerance |
| M2 Identity and writes | All prototype edits, plus create, on staging                       | Better Auth and MCP OAuth spike (gate); owner sign-in with full private view; editor with create/archive/restore; Up Next management; Book Battle with undo and cache invalidation (DB-04 write side)                                                                                                                                                                                                       | Every prototype edit works on staging; production stays read-only                                                                                       |
| M3 MCP                 | Capture through ChatGPT and Claude                                 | MCP server and tools (§6.3); connectors in both clients against staging; recap workflow moved to `save_recap`                                                                                                                                                                                                                                                                                               | From both assistants, a finished book with feedback and a recap lands correctly on staging with confirmations                                           |
| M4 Remaining parity    | Parity list complete                                               | Playground with server-side keys; `apps/jobs` weekly jobs; cover lookup                                                                                                                                                                                                                                                                                                                                     | Parity checklist (§6.1) 100% on staging                                                                                                                 |
| M5 Cutover             | Sheet retired                                                      | §5 cutover procedure                                                                                                                                                                                                                                                                                                                                                                                        | Nothing writes to the Sheet; rollback rehearsed and documented                                                                                          |

Post-cutover backlog (not committed): Sign in with ChatGPT, retrieval and embeddings, reviewable
preference suggestions (existing DISC tickets).

Codex's DB-03 and DB-04 plans are reused as task sources for M1 and M2. The prototype's ranking
engine and recap validator are ported, not redesigned.

## 8. Working agreement

Keep: real-PostgreSQL integration tests, unit tests, Playwright with axe, `pnpm check` on every
PR; TDD for product code; small PRs with green CI and a deploy preview; explicit owner approval
for merge, deploy, hosted migrations, hosted imports, Neon/Netlify configuration and cutover;
no real data in Git, CI, logs or prompts; `/code-review` on every PR, at high effort for SQL
permissions, authentication and MCP changes.

Drop: the governance gate and its policy (`governance:check` in `pnpm check`,
`tools/governance/`, `.agent-toolbox/project.json` with LIB-01–12, the policy test in
`tests/consumer-policy.spec.mjs` while keeping its Nx boundary test, GOV-01); `docs:database:check`; SHA-pinned handoff files and the `status.md` ticket table; the
per-ticket Golden Path obligation.

Information ownership: repository `docs/` for product, decisions, architecture, the database
contract and runbooks; `docs/superpowers/specs` and `plans` for designs and plans; GitHub issues
and milestones for live status; repository `AGENTS.md` (with `CLAUDE.md` as a symlink) for agent
rules, rewritten for the new scope; the private context folder for broad intent and private
evidence only, without execution state or `~/.codex` paths.

## 9. Risks and open items

| Risk / item                                                               | Mitigation or owner                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Previews hold a real-data copy on public URLs                             | Visitor allowlist enforced by database views; private API requires sign-in; consider Netlify-level password protection for previews |
| Nuxt 5 / Nitro 3 expected around Q4 2026                                  | Framework-free server libs keep the upgrade small                                                                                   |
| Netlify synchronous function timeout for Playground and MCP calls         | Measured in the M2 spike                                                                                                            |
| `biome-vue` gates M1 UI work                                              | P1 runs in parallel with M0                                                                                                         |
| Better Auth is security-critical code we configure                        | High-effort review; spike before adoption                                                                                           |
| Codex's AGENTS.md change removes database/import from the boundary line   | Rewritten deliberately in M0                                                                                                        |
| `docs/architecture.md` conflicts between the DB branches and PR #20       | Resolved when PR #20 is replaced in M0                                                                                              |
| Current Neon branches and Netlify context variables are not yet inspected | M0                                                                                                                                  |

## 10. Sources

- Private context: product thesis; `2026-09-19-database-structure.md`; data profile; database
  delivery execution contracts and ticket plans.
- Codex branches listed in §2 and the 2026-10-03 private audit summary.
- Nuxt payload-cache advisory: https://github.com/nuxt/nuxt/security/advisories/GHSA-wm8w-6qjm-cv43
- Nitro tasks: https://nitro.build/docs/tasks
- Claude remote MCP connectors: https://claude.com/docs/connectors/custom/remote-mcp
- ChatGPT developer mode MCP: https://community.openai.com/t/mcp-server-tools-now-in-chatgpt-developer-mode/1357233
- Better Auth MCP plugin: https://better-auth.com/docs/plugins/mcp
- Better Auth 1.7: https://better-auth.com/blog/1-7
- Netlify Identity status: https://netli.fyi/blog/netlify-identity-authentication
- npm registry versions read on 2026-10-04 (nuxt 4.5.2, vue 3.5.43, vue-router 5.3.1, vite 8.3.2,
  @nx/nuxt 23.2.1, @nx/vitest 23.2.1, @nuxt/test-utils 4.3.3, @modelcontextprotocol/sdk 1.32.0).
