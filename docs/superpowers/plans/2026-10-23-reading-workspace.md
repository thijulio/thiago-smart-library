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

- [x] Add browser tests for content, malformed/empty/error states, retry,
      sign-out, navigation, keyboard access and mobile layout; run red.
- [x] Implement the page and shared list using existing product styles.
- [x] Run browser tests green, including accessibility and private routes.

## Task 3: Review and readiness

- [x] Run pnpm check, pnpm test:db and pnpm test:e2e.
- [x] Fresh review against the approved spec; address actionable defects.
- [x] Record evidence and any blocked checks; prepare local commit for review.
- [x] Report that hosted migration/publication remain pending, separately.

## Execution ledger

### Original implementation session (historical evidence)

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

### Local continuation — 2026-10-27

- Checked status before fetching/switching: the local checkout was clean on
  `thijulio/schema-reference-plan` at `8864c74`. Fetched and checked out
  `codex/reading-workspace-45` at the requested
  `9e003f1217edda91a8f98767349747a1f8957ccc`, with implementation base `068d3ea`.
  No existing local edits needed moving or stashing.
- The separate cloud continuation reported a proxy HTTP 403 for
  `pkg-npm.githubusercontent.com`. Its only uncommitted change was a plan note,
  absent from this local checkout. That result does not establish an invalid
  token, and its build/browser checks were not completed.
- Local frozen installation passed using the existing published Biome 0.0.2
  dependency. No package, lockfile, registry configuration or Biome source changed.
  The local missing `NPM_TOKEN` interpolation warning was non-blocking; this run
  does not establish fresh remote package authentication.
- Verified Node `v24.22.1` and Corepack pnpm `10.19.0`. An initial subprocess
  probe found global pnpm `10.25.0`; installed temporary Corepack shims outside
  the repository and prepended their directory plus Node 24 to PATH. Confirmed
  a child shell resolves Node 24 and pnpm 10.19.0, then repeated installation,
  check, PostgreSQL and browser commands with that environment. No global
  package-manager installation was changed.
- Added same-mounted-page refresh coverage for 503, malformed responses, 401 and 403. Synthetic populated results load first; the test invokes Nuxt's existing
  `app:data:refresh` hook, delays the response, and verifies titles/reasons vanish
  while pending and after failure. A document marker verifies no reload occurred.
  Retry restores content for recoverable failures. No production test hook added.
- Browser red run exposed a real initial-loading defect: awaited non-lazy fetch
  suspended page mounting until the response, hiding the loading message. Added
  `lazy: true` so the page mounts and announces the pending request. The existing
  loading test failed before this change and passed afterward on both engines.
  Scoped status assertions to main to exclude Nuxt's separate route announcer.
- Desktop keyboard validation uses sequential Tab from Reading through theme,
  sign-out and the first book, then Enter into private details. Mobile validates
  touch navigation; desktop Tab ordering is not imposed on emulated iOS WebKit.
- Independent whole-branch read-only review against the approved spec found no
  actionable defects. Browser evidence, rather than static review, exposed and
  verified the loading correction. No deferred findings remain from this review;
  the earlier same-session coverage gap is now addressed.
- `corepack pnpm install --frozen-lockfile`: passed.
- `corepack pnpm check`: passed with Nx cache disabled, including format, lint,
  typecheck, unit suites, production build and browser boundary scan
  (`BROWSER_DATABASE_BOUNDARY_OK files=13`).
- `corepack pnpm test:db`: 166/166 passed across 15 files against the marked,
  disposable loopback PostgreSQL 16.15 container, using synthetic records only.
  Image digest: `sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54`.
- `corepack pnpm test:e2e`: 30/30 passed with Nx cache disabled across desktop
  Chromium and mobile iPhone 13 WebKit, including all four same-session refresh
  failures on both engines, loading, retry, logout and private HTTP routing.
- Visual inspection of light/dark screenshots confirmed readable cards, honest
  ties/unspecified slots, stacked mobile groups and intact navigation. The
  keyboard screenshot shows a visible focus ring on the book link. Browser
  checks passed at 390px without horizontal overflow; axe reported zero
  serious/critical violations in Reading in both themes on both engines.
  Screenshots contain synthetic fixtures and remain in ignored `test-results/`.
- Local logs are in `/tmp/reading-45-{install,check,db,e2e}-final.log`; browser
  captures are in `test-results/reading-reading-preserves--330cb-s-and-opens-private-details-{desktop,mobile}/`.
- No merge, push, deploy, hosted migration/import, provider modification, canonical
  Sheet access/change or prototype change occurred.

## Resume

Local implementation and validation are ready for owner review. Keep this branch
local; hosted migration/publication are separate pending approvals. Migration
0007 adds only `reading_for_user(text)` and must be applied under an explicitly
approved hosted migration before enabling the new production route. Builds and
function startup never apply it. Issue #44 still owns hosted multiuser acceptance.
