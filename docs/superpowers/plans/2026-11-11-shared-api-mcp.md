# Shared API and MCP Implementation Plan

> **For agentic workers:** Use parallel implementation only across the disjoint file ownership below; integrate and independently review the complete branch.

**Goal:** Implement validated conversational proposals and one scoped writer for
the browser API and OAuth-authenticated MCP, tested with synthetic records.

**Architecture:** Domain validation, narrow SQL routines, shared Nitro service,
session confirmation and stateless OAuth MCP. Imported books stay read-only.

**Tech Stack:** Existing Node 24/pnpm 10.19.0/Nuxt/PostgreSQL; pinned official MCP
SDK 1.32.2, Zod 4.6.7 and Better Auth OAuth provider 1.7.7.

**Spec:** [Shared API/MCP design](../specs/2026-11-11-shared-api-mcp-design.md).

## Global constraints

- Synthetic local databases only; no hosted migration, import, deploy or grant.
- No manual capture form, model call, new auth platform or infrastructure.
- Preserve migrations 0001–0010; use 0011 writer and 0012 OAuth schema.
- Server/browser/offline boundaries, published Biome and private logging hold.
- Explicit browser approval binds immutable proposal content; MCP cannot forge it.

## Review focus

1. Two channels cannot bypass the same ownership/native-authority rules.
2. Model-accessible tools cannot manufacture user confirmation.
3. Expired/stale/replayed operations preserve previous data and safe receipts.
4. OAuth audience/scope/session validation survives revocation and logout.
5. Disabled OAuth preserves the currently deployed Google login behavior.

## Task 1: Domain and scoped native writer

Own `libs/domain/src/lib/book-change.ts`, its tests, migration 0011 and new
`libs/database/test/book-change.integration.spec.ts`. Do not edit shared exports
or migration-count fixtures concurrently; integration owns those.

Interfaces: `BookChange`, `isBookChange`, `ChangeProposal`, `ChangeReceipt`.
SQL: `prepare_book_change(actor,request_id,change,channel)`,
`book_change_for_user(actor,proposal_id)`, `editable_book_for_user(actor,stable_id)`,
`commit_book_change(actor,request_id,proposal_id,digest)` and
`confirm_and_commit_book_change(actor,request_id,proposal_id,digest)` return JSONB.
Browser-only confirmation wrapper is not an MCP tool. Runtime gets EXECUTE only.

- [ ] Write domain and PostgreSQL tests red for validation, disabled/native scope,
      ownership, imported denial, proposal/digest/expiry, explicit confirmation,
      independent versions, concurrent commits, replay, no-op and provenance.
- [ ] Implement the closed contract, native marker/permission, proposal and
      narrow routines; preserve imported records and shared author metadata.
- [ ] Run focused domain and database tests green, including direct-table/PUBLIC
      denial and confirmation rollback. Commit with evidence.

## Task 2: Existing-auth OAuth integration

Own `apps/web/server/core/{oauth,auth,auth-response,config}*`, auth routes,
well-known routes, `/oauth/login` and `/oauth/consent` pages, migration 0012 and
new OAuth tests. Do not edit package/lockfile, shared private routing or SQL 0011.

Produce `resolveMcpPrincipal(request,auth,origin)` returning verified user ID,
client ID and scopes or null. Expose standard metadata/challenge helpers. Use
the actual pinned provider API/schema, signed oauth_query and explicit consent.

- [ ] Write tests red for default-disabled auth, metadata, PKCE/redirect rules,
      token expiry/revocation, foreign audience and required live verified session.
- [ ] Implement provider/schema/pages without runtime DDL; preserve normal
      login callbacks and use opaque hashed audience-bound tokens.
- [ ] Run OAuth/normal-auth regressions green; document client acceptance still
      requiring concrete hosted activation and real ChatGPT/Claude accounts.

## Task 3: Shared service and browser API

Own `apps/web/server/core/library-service.ts`, `change-response.ts`, private
routing integration and `/library/changes/[id].vue`. Add service/HTTP tests.
Service `prepare(actor,requestId,change,channel)`, `getProposal(actor,id)`,
`commit(actor,requestId,id,digest)`, `confirmAndCommit(...)`, `getEditableBook`,
`searchBooks`, `getBook`, `listReading` wrap only scoped SQL functions.

- [ ] Write tests red for strict bodies/size, verified persisted sessions, exact
      Origin on writes, unknown routes/methods, sanitized storage errors and
      before/after confirmation rendering. Reuse Task 1's domain contract.
- [ ] Implement the service and session adapters; preserve all existing private
      GET routes. Add accessible approve/cancel screen with exact stored values.
- [ ] Run tests green and browser/HTTP regressions; API/MCP must share service.

## Task 4: Stateless MCP protocol adapter

Own `apps/web/server/core/mcp.ts`, MCP route and SDK protocol tests. Consume the
service and principal interfaces above. No custom SQL, auth provider changes or
browser confirmation capability in this adapter.

- [ ] Write SDK client tests red for handshake, tool list, reads, proposals and
      commit, missing/insufficient scope, invalid arguments, malformed transport
      and error sanitization. Prove no tool can confirm a proposal.
- [ ] Implement official stateless transport and the six named tools, no-store
      responses and OAuth discovery challenge. Close per-request resources safely.
- [ ] Run protocol suite green with synthetic service data.

## Integration and delivery

- [ ] Update package manifest/lock, exports, fixtures/counts and schema docs.
- [ ] Run pnpm check, test:db and test:e2e. Report any install blocker precisely;
      isolated public tooling is not equivalent to full application acceptance.
- [ ] Independent whole-branch review; reproduce/fix important findings and
      rerun relevant checks before a PR. Keep hosted actions separately pending.

## Execution ledger

- Base `eb16fca`; branch `codex/shared-api-mcp-46-27`. Owner requested implementation
  after agreeing the common proposal/approval/save flow. No production grant.
- Local installation previously lacked private Biome credentials. Public isolated
  tooling exists outside Git; complete CI must verify the actual frozen lockfile.
- Pre-flight: legacy owner routines are globally scoped and attribute the shared
  SQL login, so new scoped writers must not call them or grant them to runtime.
- OAuth research inspected actual 1.7.7 source: consent uses oauth_query, opaque
  mode avoids JWT revocation gaps, and token session presence must be enforced.
- Implemented the shared domain/writer, browser API and approval page, OAuth
  provider/discovery and stateless MCP adapter. A synthetic HTTP-to-PostgreSQL
  test proves the same MCP proposal is browser-approved once and read back.
- Isolated verification: domain 34 tests, server 37 tests and full PostgreSQL
  suite 252 tests pass. Strict shared API/OAuth TypeScript passes. Frozen lockfile
  consistency passes with the published Biome records preserved exactly.
- Local full installation fails HTTP 401 for the private published Biome package.
  Public tooling enables Nuxt type/lint checks, but the production build stops at
  the unresolved Biome CSS import. Full built-browser and bundle acceptance must
  run in repository CI with its package-read token; no package source is copied.
- Independent writer/API/MCP review found no blocking issues; aligned the tool
  search length limit with the service. Hosted activation remains pending.
- Broader local checks: all five Nx lint targets pass; all typecheck targets
  pass after correcting strict test indexing. The standard `pnpm test:db` runner
  passes all 252 tests. Independent OAuth review identified an unbounded-body
  gap; a failing regression test reproduced it, then bounded streamed reads made
  the full server suite green. Browser tests collect; execution needs the build.
