# Smart Library Database Delivery — Execution Pack

> Status: proposed implementation plan, 2026-09-20. No implementation or cloud changes have been performed by writing this pack. Execute one ticket at a time, only after the user authorizes execution. Publication, merge, cloud provisioning, real-data import, and production cutover are separate approvals.

**Goal:** Build a private PostgreSQL library that can ingest the existing spreadsheet unchanged, replay safely, accept new source information, preserve native edits, and expose only explicitly approved data.

**Architecture:** Keep the Nx frontend/domain boundaries; add a server-only database library and offline import tooling. Versioned SQL owns the relational schema. The spreadsheet remains the live prototype's authority until an explicit cutover; imports are controlled operations, not continuous bidirectional synchronization.

**Tech Stack:** Node 24, pnpm 10.19.0, existing Nx/TypeScript/Vitest/Playwright, PostgreSQL, Neon, existing Netlify functions. SQL + node-postgres for migrations/offline transactions; existing Neon HTTP driver for approved public read endpoints. No ORM, pgvector, new auth service, or model calls in this delivery.

Promoted 2026-10-02. This repository copy owns future execution; the private planning source is provenance only. Live delivery state is tracked in GitHub milestones.

**Spec:** [Database structure and migration contract](../spec.md), supplemented by [execution contracts](execution-contracts.md). Read both. The supplement resolves the later conversation's incremental-import rules and distinguishes current Sheet findings from the old workbook.

## 1. What this pack includes

| User stage              | Ticket                             | Deliverable                                                                                   | Depends on |
| ----------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| 0 — AI-ready context    | DB-00 (merged)                     | Portable entrypoint, current state, spec promotion, instructions, dependency version contract | None       |
| 1 — Database foundation | [DB-01](01-schema.md)              | Isolated PostgreSQL harness, migrations, core tables, role and constraint tests               | DB-00      |
| 2 — Incremental seed    | [DB-02](02-import.md)              | Lossless extraction, dry-run, three-way merge, transactional import                           | DB-01      |
| 3A — Enrichment         | [DB-03](03-enrichment.md)          | Quotes/recaps/catalogs, source-owned collection reconciliation, quarantine                    | DB-02      |
| 3B — Comparisons        | [DB-04](04-events-rankings.md)     | Immutable events, replacement/undo, reproducible ranking cache                                | DB-03      |
| 4 — Adoption            | [DB-05](05-application-cutover.md) | Owner CLI, opt-in public read path, rehearsal, restore, gated cutover                         | DB-04      |

These are **local ticket specifications**, not GitHub issues already created. One ticket may require several local commits; do not create PRs or push merely because a ticket mentions review.

DB-05 does not recreate every legacy UI feature. Its deliverable is a controlled data-store transition with a usable owner CLI and optional public catalogue. A private browser editor requires a separately approved authentication design. If the user requires browser feature parity before abandoning the prototype, retain the Sheet as canonical and stop at rehearsal; do not label that state a cutover.

## 2. Verified baseline and preflight

- GitHub `main` was inspected at `3841213f6db5ee8bf98620094e2a2ac10881b8ac` (PR #3, database health). This is a baseline, not a permanently pinned execution head.
- `<application-checkout>` was clean but checked out on old branch `thijulio/netlify-package-auth`, at `e559c2e`. Do not implement directly there without checking it again.
- An existing worktree is `<existing-health-worktree>`; do not repurpose or delete it.
- Prototype source was inspected at `da23c6b98f9a029ab357f60691fc57f7bfe4f9d9`. It is reference input only, not a destination for edits.
- Current repo has health connectivity, but no committed application schema, importer, or database integration-test target.
- Historical XLSX SHA-256: `6818c71c60941311564beb3e0afefa02f9957a6ad448aa5046dfd7d72267f502`. Keep it private; do not use it as proof of current Sheet contents.

Before each ticket:

```sh
git status --short
git branch --show-current
git log -1 --oneline
git worktree list
node --version
pnpm --version
```

Expected toolchain: Node major 24 and pnpm exactly 10.19.0. Preserve dirty files. Starting implementation, fetch the named remote, inspect current `origin/main`, and create an isolated `thijulio/` worktree using the host's worktree workflow. Never reset the user's checkout. For DB-01 onward use the accepted predecessor commit, not a main branch that lacks earlier tickets.

The planning shell was actually on Node 22; Node 24.18.0 is installed under the local NVM directory. An executor must activate Node 24 first (`nvm use 24` when NVM is loaded), then re-run the version checks. Do not weaken package engines to accommodate the shell. Exact absolute NVM paths are local convenience, not repository configuration.

## 3. Global constraints

### Golden Path adoption and improvement

Confirmed by Thiago on 2026-10-02: follow `thijulio/golden-path` and improve
that repository as Smart Library delivery produces reusable knowledge.

- Before each ticket, read the current Golden Path `AGENTS.md`, `tech-radar.md`,
  and relevant `decisions/`. The local repository is
  `<golden-path-checkout>`; revalidate its state before edits.
- Include a Golden Path alignment check in DB-00. Record existing differences
  and resolve them within the approved ticket scope; do not silently replace
  the approved database plan or add dependencies merely for conformity.
- During every ticket, identify reusable decisions, implementation patterns,
  validation checks, and workflow fixes. Carry applicable improvements into
  Golden Path alongside the project work, with evidence and clear ownership.
- Keep project-specific data and private evidence in Smart Library. Promote
  reusable contracts and verified patterns; distinguish proposals from adopted
  or executed decisions.
- When shared decisions change, update Golden Path's markdown source and its
  corresponding typed documentation-site content together. Add executable
  templates or checks when a demonstrated reusable pattern warrants them.
- Every ticket handoff records Golden Path alignment, shared improvements,
  their validation, and any outstanding gaps. If nothing reusable emerged,
  state that explicitly; do not manufacture a cross-repository change.
- Push, PR publication, merge, deployment, and cloud changes retain the separate
  authorization gates below for both repositories.

### Project and data boundaries

- Durable code, comments, tests, artifacts, and commits are in English.
- One personal library/owner; no inferred multi-tenancy, edition matching, or rereading history.
- Stable Book IDs are text; preserve UUID strings and legacy slugs exactly. Never identify books by title or row number.
- Keep all original source evidence privately; optional bad fields are quarantined, not silently discarded or guessed.
- Do not change the Google Sheet, prototype repository, or old prototype deployment.
- Do not run schema/import work on build, function startup, or production automatically.
- Never put DB URLs, workbook data, import reports, backups, or private fixtures in Git, CI logs/artifacts, frontend bundles, or model prompts.
- The old `docs/schema/schema.sql` is a prototype, not a migration. Never execute it as the implementation.
- `libs/ai` stays documentation-only. No AI calls, embedding backfill, or vector extension.
- Use real PostgreSQL for FK, privilege, rollback, optimistic-write, and concurrent-write tests. Mocks do not establish these properties.
- The database remains private unless a separate public-read publication gate is approved.

## 4. How an inexpensive agent should work

1. Read repository `AGENTS.md`, this index, execution contracts, and only the selected ticket plus its named spec sections.
2. Restate the ticket, allowed paths, preconditions, and excluded work in at most ten lines.
3. Implement each checkbox using red test → minimal implementation → green test.
4. Do not bypass a failing test, weaken privacy, or reinterpret a source value to force a historical total.
5. Record evidence in the handoff template. Mark a ticket complete only when every acceptance check passes.
6. If a concrete environment gate fails, finish independent local work and report the exact gate; never guess credentials, cloud configuration, auth, or data semantics.

Read-only discovery is allowed. Execute sequentially in the chosen agent; do not spawn additional agents or switch models unless asked. Independent human/senior review is a gate for SQL permissions, merge policy, event concurrency, and cutover. The executor may prepare review evidence but cannot grant itself approval.

## 5. Execution commands and their availability

Existing: `pnpm check`, `pnpm test:e2e`, `pnpm dev`, `pnpm dev:netlify`.

Planned by DB-01: `pnpm db:up`, `pnpm db:down`, `pnpm db:migrate`, `pnpm db:status`, `pnpm db:doctor`, `pnpm test:db`.

Planned by DB-02: `pnpm db:extract`, `pnpm db:import`, `pnpm db:verify`.

Planned by DB-04: `pnpm db:rankings`.

Planned by DB-05: `pnpm db:owner`, `pnpm db:backup`, `pnpm db:restore`.

These commands do not exist merely because they are listed here. Their exact arguments and outputs are defined in the corresponding ticket. Each CLI must support `--help`; unknown flags and missing prerequisites fail before mutation.

## 6. Review focus across the whole pack

| Failure mode                                    | Required behavior                                                                   | Test owner  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ----------- |
| Stale checkout/context                          | No execution from old state or competing specs                                      | DB-00       |
| Repeat seed, including concurrent attempts      | Same canonical entities, stable IDs, links and events; no unnecessary version bumps | DB-02/04    |
| Blank/older Sheet plus native edit              | No accidental erasure or stale overwrite                                            | DB-02       |
| Reordered child rows without child IDs          | Parent-scoped reconciliation; no positional cross-snapshot upsert                   | DB-03       |
| Bad recap references marked verified            | Preserve content, withhold disputed source edges/publication                        | DB-03       |
| Retry after status change or cache rebuild race | Idempotent retry; stale results never replace newer ranking inputs                  | DB-04       |
| Public requests/preview builds                  | No private columns, credentials, private-term matches or production test data       | DB-05       |
| Failure midway through migration/import/cutover | Rollback/recovery with retained evidence; no silent partial state                   | DB-01/02/05 |

## 7. Explicit scope gates

| Action                                                   | Allowed by authorizing local ticket execution?    |
| -------------------------------------------------------- | ------------------------------------------------- |
| Code/tests/docs in isolated checkout, synthetic local DB | Yes                                               |
| Reading approved local exports                           | Yes, only where that ticket needs them            |
| Creating GitHub issues/PRs, push, merge                  | No; separate publication instruction              |
| Creating Neon branches/roles or changing Netlify secrets | No; name target and obtain cloud-change approval  |
| Importing real data into any hosted database             | No; approve environment and private-data handling |
| Disabling prototype writers or publishing library fields | No; explicit cutover/publication gate             |
| Paid model requests/new subscriptions                    | Outside this pack                                 |

## 8. Technical references

Checked 2026-09-20. These explain mechanisms, not product authority:

- [node-postgres transactions](https://node-postgres.com/features/transactions): use one checked-out client for the entire transaction.
- [PostgreSQL function security](https://www.postgresql.org/docs/current/sql-createfunction.html): restrict SECURITY DEFINER search paths and execution grants.
- [PostgreSQL backup tool](https://www.postgresql.org/docs/current/app-pgdump.html): record compatible tool/server versions and verify restore separately.
- [Neon export guidance](https://github.com/neondatabase/website/blob/main/content/docs/guides/export-neon-postgres-compatible.md): direct connections for dump/restore.
- [ExcelJS](https://github.com/exceljs/exceljs): extractor library; the original XLSX bytes remain the lossless source, not the library's interpreted values.

The pack recommends a tested CLI for recurring extraction/import/verification rather than having an AI repeatedly improvise spreadsheet transformations. The AI makes bounded implementation decisions; deterministic tooling owns hashes, validation, merge decisions, and reports.
