# Reading Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task.

**Goal:** Show current reading and explicit Up Next choices privately.

**Architecture:** A scoped SQL projection feeds a private HTTP DTO. Pure domain
grouping drives a client-rendered Nuxt page using existing Biome styles.

**Tech Stack:** Node 24, pnpm 10.19.0, TypeScript, PostgreSQL, Nuxt, Vitest, Playwright.

**Spec:** ../specs/2026-10-23-reading-workspace-design.md (approved in chat).

## Global Constraints

- No AI, imported-data writes, reimport or production changes.
- Preserve session ownership, no-store responses and browser/server boundaries.
- Preserve missing slots and tied ranks. Only ranked unread/wishlist books queue.
- Use published Biome CSS and synthetic test records.

## Review Focus

- Duplicate rank must not discard a book or imply a chosen tie order.
- Missing contract fields must not look like an intentionally empty queue.
- Expired sessions and request errors must hide previous private content.
- Physical/Unknown formats must remain visible.
- Runtime role must gain no base-table or public function access.

## Task 1: Scoped reading data

Files: domain reading DTO/helpers/tests; migration 0007; private-library.ts;
reading integration tests and private HTTP integration tests.

Interfaces: `ReadingBook extends BookCard` adds nextRank, nextSlot and whyNext;
`ReadingResponse` contains books and `queueState: 'available'`.
`groupReadingBooks(books)` produces current and queue groups;
`isReadingResponse(value)` validates the boundary before UI rendering.

- [x] Write domain tests for grouping, eligibility, ties and invalid DTOs; run red.
- [x] Implement domain DTO, guards and grouping; run domain tests green.
- [x] Write database/HTTP tests for selection, isolation and failure; run red.
- [x] Add immutable scoped routine and authenticated endpoint; run tests green.

## Task 2: Reading page

Files: apps/web/app/pages/library/reading.vue, ProductHeader.vue,
ReadingBookList.vue, apps/web-e2e/src/reading.spec.ts.

Consumes Task 1's response and groups. Produces `/library/reading`, navigation,
accessible current-reading and queue sections and private book detail links.

- [ ] Add browser tests for content, malformed/empty/error states, retry,
      sign-out, navigation, keyboard access and mobile layout; run red.
- [x] Implement the page and shared list using existing product styles.
- [ ] Run browser tests green, including accessibility and private routes.

## Task 3: Review and readiness

- [ ] Run pnpm check, pnpm test:db and pnpm test:e2e.
- [x] Fresh review against the approved spec; address actionable defects.
- [x] Record evidence and any blocked checks; prepare local commit for review.
- [x] Report that hosted migration/publication remain pending, separately.

## Execution ledger

- The managed workspace is already task-isolated on branch `work`.
- Implementation authorization is the owner's acceptance of the design.
- Pre-flight: Task 2 consumes Task 1's DTO and groups; names agree.

- Task 1: domain tests failed before implementation, then 6/6 passed; scoped
  database and signed HTTP tests failed before implementation, then 15/15 passed.
- Full real-PostgreSQL integration suite: 166/166 passed after updating synthetic
  migration numbers and the bootstrap count for the additive 0007 migration.
- Formatting, lint and typecheck passed for all projects. Unit tests for domain,
  importer, web and web-e2e passed. Database unit suite: 69 passed, two schema
  rendering tests blocked by missing published Biome CSS.
- Ruling: install public dependencies in an external temporary directory to run
  independent checks. Keep package.json and the committed lockfile unchanged;
  never substitute CSS or claim full-package validation. Risk: browser/build
  acceptance remains outstanding until the exact published package is restored.
- Environment reports no configured secrets. Normal frozen install fails 401 for
  @thijulio/biome-css 0.0.2. Owner was asked to configure NPM_TOKEN with
  read:packages privately. A temporary node_modules symlink points to the public
  dependencies; it is excluded locally from Git.
- Browser tests were written but could not run: the actual application build
  cannot resolve @thijulio/biome-css/biome.css. The UI red/green cycle, screenshots,
  accessibility, mobile checks and built bundle scan remain unverified.
- Fresh independent review found no blocking implementation/security defects.
  Minor deferred: test same-session refresh failure after populated data; the
  existing 401 browser test reloads and therefore does not prove stale in-memory
  data is hidden. Current page gates display on successful, valid response.
- No hosted migration, import, provider modification, merge or publication ran.

## Resume

Restore GitHub Packages access, run the normal frozen installation with pnpm
10.19.0, then run pnpm check, pnpm test:db and pnpm test:e2e. Preserve the
published Biome dependency. Resolve any newly observed UI failures before
requesting concrete hosted migration/release approval. Migration 0007 adds only
reading_for_user(text); deploy it before enabling the new production route.
