# Scoped AI Storage Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Preserve the execution ledger and use synthetic fixtures only.

**Goal:** Implement private, versioned app-result storage without changing imported source authority or activating production writers.

**Architecture:** Add typed framework-free contracts, separate relational revision streams and narrow scoped SQL routines. A private Nitro read adapter consumes persisted projections; producer and user-intent capabilities stay separate. Existing Reading and imported Up Next remain unchanged.

**Tech Stack:** Node 24, Corepack/pnpm 10.19.0, TypeScript, PostgreSQL, Vitest, Nuxt.

**Spec:** [Scoped storage design](../specs/2026-11-06-scoped-ai-storage-design.md).

## Global constraints

- Preserve package.json, pnpm-lock.yaml and published Biome consumption.
- Use only disposable loopback PostgreSQL and synthetic records for execution.
- No model calls, scheduled worker, provider setup, production writer activation,
  imports, canonical Sheet/prototype changes or hosted SQL in this plan.
- Preserve immutable migrations 0001–0007. Recheck free migration numbers before
  adding 0008 onward; reject a collision rather than rename applied migrations.
- Keep HTTP actors session-derived and offline libraries out of runtime/browser.
- Store bigint revision numbers as positive decimal strings in JavaScript DTOs.
- Retain historical revisions; no destructive down-migration recovery.
- Successful storage implementation does not close #44's hosted acceptance.

## Review focus

1. A first-publication race must not create two heads or two receipts.
2. An input changing between validation and commit must not publish fresh output
   from stale evidence; a stream lock alone is insufficient.
3. Identical operation replay must succeed after the head advances, but replay
   must never bypass current authorization or expose another actor's receipt.
4. Archiving a book must hide current output without deleting retained history.
5. A failed producer run must not erase a useful previous result or one
   platform's pending deferral when updating the other platform.

## Task 1: Typed envelopes and payload boundaries

Files: create `libs/domain/src/lib/ai-storage.ts` and its `.spec.ts`; export from
`libs/domain/src/index.ts`. Keep dependency hashing/server authorization out of
browser-facing domain helpers.

Interfaces:

- `ResultKind = 'enrichment' | 'taste' | 'format'`.
- `StoredState = 'missing' | 'fresh' | 'stale' | 'unavailable'`.
- `PlanPlatform = 'Kindle' | 'Audible'`.
- `StoredResult` is a discriminated union of missing/unavailable (no revision)
  and fresh/stale (a valid typed immutable revision and freshness reason).
- `isStoredResult(value: unknown): value is StoredResult` and
  `isStoredPlan(value: unknown): value is StoredPlan` reject malformed envelopes.
- Revision metadata has `id`, decimal-string `revision`, `schemaVersion: 1`,
  `calculatedAt`, producer/model/provider/rubric/prompt identifiers and dependency
  fingerprint. Payload discriminants match their stream kind.
- Enrichment stores description, tags and source references. Taste stores named
  rubric scores with explicit numeric scale bounds; reject nonfinite/out-of-range
  values. Format stores edition/format evidence and explicit unknown judgments;
  never infer a narrator or listening quality from a missing field. No enjoyment
  probability or fixed product scoring scale is introduced.
- Plan payload contains owned stable book IDs, positions, reason/evidence links
  and dependency revision IDs; its accepted-empty state has `entries: []`.

- [ ] Write tests for every valid state/kind, missing required metadata, malformed
      dates/hashes, numeric revision IDs, nonfinite scores, unknown format
      evidence, duplicate/gapped positions and accepted empty plans.
- [ ] Run `corepack pnpm exec vitest run --config libs/domain/vitest.config.ts`.
      Expected red: missing exports/validators, not missing tooling.
- [ ] Implement the types and validators. Bound payload arrays/text explicitly
      and pin those limits in tests before SQL/HTTP consumers are implemented.
- [ ] Re-run the domain suite. Expected green; then typecheck domain and commit.

## Task 2: Additive schema and authority amendment

Files: new `libs/database/migrations/0008_scoped_ai_storage.sql`,
`libs/database/test/ai-storage.integration.spec.ts`; extend
`libs/database/test/harness.ts` for a synthetic producer connection. Amend
`docs/database/spec.md` and `docs/database/plans/execution-contracts.md` with the
accepted isolated storage authority, without enabling native/imported book writes.

Interfaces: `library.ai_result_streams`, `ai_result_revisions`,
`reading_plan_streams`, `reading_plan_revisions`, `reading_plan_entries`,
`preference_evidence`, `plan_deferrals`, `app_operation_receipts`.

- All roots carry `library_id`; every revision belongs to one stream/library.
  Head revisions must belong to that stream, not merely share its library.
- Book/library foreign keys use a unique composite membership key; dependent
  result/evidence references carry the same library ID. Revisions are append-only.
- Result stream identity is library/book/kind; plan identity is library/platform.
- Plans enforce positive unique positions and unique books; publication checks
  contiguous ordering. Historical book references survive archive.
- Receipts use actor/operation/request UUID uniqueness and canonical request hash.
- Create guarded NOLOGIN `library_ai_producer`, following 0001/0006's unsafe
  preexisting-role checks. No login, ownership membership or table grants.

- [ ] Write failing integration tests for tables, constraints, stream-specific
      heads, cross-library dependencies and direct/PUBLIC access denial.
- [ ] Run the focused integration file through the guarded local harness.
      Expected red: missing relations/functions after successful DB setup.
- [ ] Add schema/constraints and the contract amendment; update fixed migration
      counts in existing tests only where the new additive migration requires it.
- [ ] Re-run focused tests and the existing migration/role suites. Expected green.
      Confirm a second migration run is a checksum-verified no-op, then commit.

## Task 3: Atomic result publication and replay

Execution decisions for this task:

- Ruling: add immutable policy revisions plus producer-only
  `configure_ai_result(actor, request_id, expected_policy_revision, request)`.
  Without a current rubric/model policy, storage cannot detect version changes
  before another result is calculated. This adds internal coordinator setup, not
  a settings UI or hosted writer. Cost: one extra configuration operation per
  new/changed stream policy; identical policy requests do not advance its version.
- Ruling: add read-only `ai_result_inputs_for_user(actor, stable_id, kind,
selector)` with selector `{fields, resultRevisionIds, relatedBooks?}`. It returns canonical
  `{manifest, fingerprint, policy}`; publication requires that captured context
  still matches current authorized data. Fields are an explicit book-detail
  allowlist; preference IDs are captured automatically for taste/format, not
  enrichment. Hash selected values together with their source provenance.
  Cost: canonical manifests are PostgreSQL JSONB/hash-version specific; they
  must be versioned rather than recomputed in a browser.
- Ruling: optional `relatedBooks: [{bookStableId, fields}]` captures selected
  owned-book inputs for reading-history feedback without inventing a derived
  result dependency. At most 127 related books per manifest and 512 distinct
  locked books per publication are allowed. Freshness caches per-book field
  hashes across the graph. Cost: larger calculations must split their scope.
- Ruling: writers require READ COMMITTED isolation, checked before acquiring
  locks. Repeatable-read transactions can retain obsolete preference evidence
  after waiting for a lock; they are rejected instead of publishing from that
  snapshot. Cost: coordinators must use the normal READ COMMITTED transaction.
- Ruling: dependency graphs are library-private, acyclic across result streams
  and limited to 128 total revisions including the result being read/published.
  Every referenced result must be a current fresh head. Transitive freshness is
  checked iteratively, not by unbounded recursive application calls. Cost: a
  coordinator must split larger calculations and cannot depend on its own prior
  stream revision, which would immediately become stale when the head advances.
- Ruling: all new writers use shared import gate `(73421,2)`, request-identity
  lock namespace 73423, per-library context namespace 73422, then affected book
  rows in numeric order and stream locks. This serializes evidence/policy/head
  changes without holding a transaction over a model call. Existing book writers
  do not acquire the new context lock, avoiding an inverse lock order. Cost:
  publication within one library serializes; unrelated libraries remain separate.
- Ruling: publication receipts return immutable revision identity only, not a
  cached `fresh` DTO. Replay after source changes must not claim an old result
  is still fresh; a separate read computes current freshness. SQL-owned actor
  parameters remain trusted service inputs, matching existing scoped reads.

Files: new `0009_scoped_ai_result_operations.sql`,
`libs/database/test/ai-result-operations.integration.spec.ts`.

Interfaces: `library.publish_ai_result(actor text, request_id uuid,
expected_revision bigint, request jsonb) RETURNS jsonb`,
`library.ai_result_for_user(actor text, stable_id text, kind text) RETURNS jsonb`.
The first result uses an explicit null expected revision. SQL bigint values
serialize to the Task 1 decimal-string revision contract.

- Dependency manifests use an allowlist of source fields and referenced owned
  revisions. Recompute canonical fingerprints server-side using documented
  JSONB/value-hash encoding; producer claims do not establish freshness.
- Authenticate ownership before receipt lookup; lock receipt identity before
  first-write stream identity; exact replay returns its original result.
- New publication takes shared writer gate `(73421,2)`, then existing ranking
  lock if required by execution contracts, books in numeric ID order, relevant
  mutable evidence locks, then stream locks. Import remains exclusive at the
  shared gate. Revalidate current source hashes/revisions under these locks.
- Preference/deferral mutation and publication must share a per-library context
  lock before stream locks; use the same order in Task 4. Do not rely on the
  shared import gate to serialize two ordinary writers.
- Publish revision, head and receipt in one transaction; typed conflicts leave
  no partial writes. Use fixed search paths and PUBLIC revocations.

- [x] Tests: exact replay after later head, changed-body replay rejection,
      authorization before replay, concurrent first write, concurrent head
      updates, changed inputs, foreign references, invalid payload, rollback.
- [x] Reproduce red with real PostgreSQL, implement routines/grants, then green.
- [x] Test concurrent import/preference changes with two checked-out clients and
      controlled transaction barriers. Assert stale evidence cannot commit as
      fresh. No arbitrary sleeps as concurrency evidence.
- [x] Verify existing imported values/provenance are unchanged and reads cause
      no writes. Commit only after focused and migration/role suites pass.

## Task 4: Preferences, platform plans and recoverable history

Execution decisions:

- Ruling: producer-only propose_preference_evidence appends inferred proposals;
  runtime-only save_preference_evidence records explicit statements or decisions
  on retained inferences. Producers may revise only pending proposals, preventing
  indirect revocation of acceptance. Cost: a later inference needs a new identity.
- Ruling: immutable plan policies and input capture mirror Task 3. Capture names
  at most 512 owned books and 127 result dependencies, plus accepted preference
  IDs, latest platform deferral IDs and up to 1000 active candidates matching the
  platform or Unknown, with status/platform provenance. Cost: Unknown candidates
  are shared context and may invalidate both platforms.
- Ruling: publication locks all library books in numeric order before the stream,
  rejecting more than 2048 memberships. Cost: larger libraries need a later lock
  scope refinement rather than silent omission.
- Ruling: deferrals compare their own expected counter and expected platform plan
  revision. Publication captures intent revision IDs without cancelling them.
  Cost: future pending/consumed UI derives that state from the plan manifest.
- Ruling: an archived entry makes the current plan unavailable while retaining
  history. Filtering entries could invent a different accepted sequence. Cost:
  that platform needs a replacement before its plan can be displayed.
- Ruling: plan receipt replay authorizes the verified library owner and returns
  only revision identity, including after archive. The current projection hides
  archived content. Cost: coordinators must read current freshness after replay.

Files: new `0010_scoped_plan_operations.sql`,
`libs/database/test/plan-operations.integration.spec.ts`.

Interfaces (all return typed JSONB receipts/projections):

- `library.save_preference_evidence(actor text, request_id uuid,
expected_revision bigint, request jsonb)`.
- `library.record_plan_deferral(actor text, request_id uuid,
expected_plan_revision bigint, request jsonb)`.
- `library.publish_reading_plan(actor text, request_id uuid,
expected_revision bigint, request jsonb)`.
- `library.reading_plan_for_user(actor text, platform text)`.

User-only routines cannot set producer metadata or inference authorship;
producer routines cannot accept/reject inferred evidence on the user's behalf.
Deferral request versions distinguish creation/cancellation; preserve intent
through a publication and reference its consumed revision in the manifest.
This stores supplied intent, not #54's deferral UI or placement algorithm.

Task 3's gate/receipt/lock order applies. Kindle-only sequence changes must not
mark Audible stale unless shared evidence actually changed. Republish a retained
payload through a new operation/revision with current expected-head and input
checks; never rewind a head or rewrite an old revision.

- [x] Tests: explicit/inferred privilege separation; foreign/archived books;
      plan entry constraints; two-platform independence; pending/cancelled
      deferrals; replay/concurrency; producer failure preserving accepted output;
      retained-payload recovery remaining stale when inputs are obsolete.
- [x] Run focused tests red, implement operations, then run green plus Tasks 2/3.
- [x] Replay a synthetic import using existing fixture/runner conventions and
      verify all app revisions, heads, receipts and deferrals survive unchanged.
- [x] Check grants via producer/runtime/public test connections and commit.

## Task 5: Private read projections and full acceptance

Files: `apps/web/server/core/private-library.ts`,
`libs/database/test/private-http.integration.spec.ts`, domain exports; update
the design/plan execution evidence with actual results.

Interfaces: authenticated `GET /api/private/ai-results/:kind/:stableId` and
`GET /api/private/reading-plans/:platform` consume Tasks 3/4. Actor comes only
from the persisted session; validate decoded kind/platform/stable ID and return
sanitized no-store DTOs. Unknown/foreign books use indistinguishable 404s;
an owned book without results returns explicit missing data. Invalid available
storage payloads are unavailable, never an empty successful plan.

- [x] Write HTTP tests red for verified actors, forged ownership parameters,
      revoked/unverified sessions, missing/stale/empty projections, malformed
      storage returns, sanitized failures and method rejection.
- [x] Implement only private read routes and boundary validation. Do not expose
      generic JSON write APIs, change Reading's source queue or activate a worker.
- [ ] Run HTTP tests green; then `corepack pnpm check`, `corepack pnpm test:db`
      and `corepack pnpm test:e2e` with Corepack available to child processes.
      Expected: all pass, including browser/server bundle scanning and existing
      Reading regressions. A blocked install is not a red application test.
- [ ] Request an independent whole-branch review, fix actionable defects with
      regression evidence, commit and prepare a feature PR. Report local/CI
      evidence separately from hosted actions; retain #44's acceptance gate.

## Execution ledger

- Base: `550b4da`; design-only commit `7b639b3`, draft PR #59.
- Owner directed continued work after the design PR was presented. No new hosted
  operation or imported/native book-state write is included in that direction.
- Plan self-review: Tasks 1–5 cover the proposed spec; shared contracts are
  defined before consumers. SQL lock/receipt order is consistent across Tasks 3/4.
- Tasks are not yet executed. Local frozen installation remains blocked by the
  cloud proxy's missing pkg-npm.githubusercontent.com allowance; do not invent
  test success from source inspection.
- PR #59 CI evidence on `7b639b3`: frozen install, `pnpm check` and PostgreSQL
  matrix passed. Browser installation failed because the rolling Ubuntu 26.04
  runner is unsupported by locked Playwright 1.58.2. Independent fix PR #60 pins
  browser jobs to Ubuntu 24.04; its actual CI results must be checked separately.
- Task 1 in progress: added closed result/plan envelopes and bounded typed
  payload validators. The initial missing-module test was followed by an
  executable stub run showing 5 failing assertions/2 passing; implementation
  made the focused suite pass. A later application-producer test failed first
  and then passed without fabricating model provenance.
- Temporary tooling outside the repository uses exact Vitest 4.1.11,
  TypeScript 5.9.3 and Node types 24.10.1; the temporary config points at the real
  domain files and resolves only test tooling. Domain suite: 18/18 passed across
  three files; domain TypeScript check passed. These are isolated checks, not
  `pnpm check`, database acceptance or a restored frozen local install.
- Independent read-only code review found no important parsed-JSON implementation
  defect. Its missing-boundary-tests finding was addressed with maximum accepted
  and maximum-plus-one rejected payload cases. Sparse JavaScript arrays are a
  deferred hardening consideration: parsed JSON cannot contain array holes.
- Task 1 wire formats/limits and application-versus-model provenance are now
  explicit in the design. SQL, HTTP consumers and Tasks 2–5 are not implemented.
- Task 1 complete at `3f2a050`: isolated domain tests 18/18 and TypeScript passed;
  GitHub CI, PostgreSQL 16.15/18.6 and schema-reference workflows all passed on
  that exact commit. Full repository `pnpm check` and browser E2E were executed
  by CI, not inferred from the isolated tooling. PR #59 is ready for review.
- Task 2 local foundation: migration 0008 adds separate app-owned tables, a
  normalized plan-entry judgment relation, immutable history and a guarded
  NOLOGIN producer group with no table/writer grants. Imported values/provenance
  and migrations 0001–0007 remain unchanged. Contract sections document this
  local scope without claiming hosted application or writer enablement.
- Task 2 red/green: five focused schema tests first failed against absent tables,
  then passed. Late insertion into a published plan was separately observed to
  succeed incorrectly; the guard now rejects it. Inferred-provenance validation
  was mutation-checked: removing the constraint made its assertion fail.
- PostgreSQL 16.15, disposable loopback container, synthetic data only: 111/111
  integration tests passed across ten database files, including nine new schema
  tests, bootstrap/migration replay, roles, core writes, ownership and Reading.
  These used exact Vitest 4.1.11 and pg 8.23.0 in isolated temporary tooling;
  full `pnpm test:db` and schema rendering remain CI acceptance work.
  Image digest: `sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d`.
- Fixed synthetic migration fixture numbering after observing two regression
  failures from duplicate ordinal 0009. The rerun passed all 111 tests.
- Independent schema review found no blocking defect. Task 4 must acquire a
  stream lock before inserting plan revisions, avoiding FK KEY SHARE lock
  upgrades in concurrent owner constructions. Its tests must include late
  judgment insertion and same-library wrong-stream plan heads; foundation
  constraints implement those rules but those two cases lack direct tests here.
- PR #60's exact runner fix also passed all workflows after one targeted retry
  of the cancelled schema-16.15 job. No application behavior or lockfile changed.
- Cross-branch CI exposed a preexisting mobile Reading audit race: 29 E2E tests
  passed, while the dark-theme audit sampled light link colors over the already
  dark background. Inspection of the exact published CSS in the schema artifact
  confirmed a 250ms link-color transition. Reading now waits on actual active
  CSS transitions after each theme change before auditing/screenshotting; it does
  not disable motion, sleep for a fixed duration or suppress contrast findings.
  The failed browser assertion is the red evidence; fresh CI must prove green.

- Task 3 resumed from PR #61 head `ec7deb2`; PR #59 is merged as `707af0e`,
  with all post-merge workflows passing. PR #61 remains unmerged; no hosted
  migration or writer enablement is included in Task 3.
- Task 3 red/green: eight initial tests failed against missing routines, then
  passed after implementation. An expanded run exposed a test-observation issue:
  the synthetic owner cannot inspect another login's pg_stat_activity wait state.
  Using pg_blocking_pids verifies the actual barrier without monitoring grants.
  Both controlled import/preference races then passed, rejecting changed inputs.
- Task 3 boundary regression: whitespace-only descriptions incorrectly published
  under PostgreSQL btrim. A failing test reproduced this; SQL now recognizes the
  JavaScript whitespace set and preserves UTF-16 length bounds.
- Intermediate local regression passed 128/128 cases across eleven files on
  disposable synthetic PostgreSQL 16.15; later focused additions passed 21/21.
  Isolated tooling versions match the previous Task 2 ledger and do not stand in
  for frozen-install repository checks. Final results are recorded below.
- Task 3 independent review findings were reproduced as three failing tests:
  malformed relatedBooks storage raised 22023 instead of unavailable;
  repeatable-read publication was accepted despite potentially obsolete evidence;
  and arbitrary-precision score bounds could collapse to equal JavaScript values.
  Type guarding/defensive handling, a READ COMMITTED writer guard and double-scale
  validation made all three pass. Read-only follow-up review found no remaining
  important defect; the reviewer did not independently rerun the tests.
- Final Task 3 local verification: 138/138 real-PostgreSQL integration tests across
  eleven files, including 27 result-operation cases; targeted TypeScript and
  git diff --check passed. Exact Node 24.19.0/Corepack pnpm 10.19.0 confirmed.
  Migrations 0001–0008, package.json and pnpm-lock.yaml are unchanged. The prior
  Reading-notes stash is preserved. Full frozen-install checks and E2E remain CI
  validation because the enforced cloud policy still excludes the package CDN.
- Task 3 PR #62, code commit `023375e60343675963ed2bf0038352c73fd0fdde`:
  all three GitHub workflows passed. CI run `42472907495` performed the real
  frozen installation, pnpm check and 30/30 browser E2E tests. Database run
  `42472907468` passed 202/202 tests twice on each of PostgreSQL 16.15 and 18.6.
  Schema-reference run `42472907493` passed both version builds and UI/artifact
  checks. This supplies full CI acceptance separately from the constrained local
  tooling. PR #62 is stacked on unmerged PR #61. Tasks 4–5 remain unimplemented;
  no hosted SQL, writer activation, merge or production deployment was performed.

- Tasks 4–5 start at PR #62 head d6eb76c on codex/scoped-plan-operations-50.
  Workspace was clean; the Reading stash is preserved. Enforced cloud revision 7
  still excludes the package CDN. Exact public temporary tooling remains separate
  from unchanged project dependencies, lockfile and published Biome.
- Task 4: seven tests first failed on missing routines, then passed. Expanded
  tests cover privilege separation, decisions, platform independence, controlled
  two-client preference/publication races, judgment freshness, rollback/replay,
  archive and a real synthetic XLSX import. Import apply/replay preserved all app
  policies, revisions, heads, entries, preferences, receipts and deferrals.
- Automatic candidate provenance initially remained fresh incorrectly. Its test
  failed; including status/platform provenance in the snapshot made it pass.
- Task 5: four HTTP route/projection tests failed before implementation. Temporary
  tooling needed pinned auth packages and the actual source tsconfig; these setup
  errors are not feature red evidence. New routes use persisted session actors,
  validate closed domain DTOs and identity, preserve no-store/404 privacy and
  return unavailable for malformed storage instead of a false empty plan.
- A verified account without a library initially got 503; a failing regression
  now receives missing without creating records during its read. Writes still
  require an existing library. Intermediate 174/174 PostgreSQL/HTTP tests passed
  across thirteen files. A read-only whole-branch review found no important or
  critical defect and did not independently run tests. Final receipts follow.
- Final local Tasks 4–5 regression: 177/177 PostgreSQL/HTTP cases passed across
  thirteen files, including 18 plan-operation and 21 HTTP cases. Targeted
  TypeScript, formatting and diff checks passed. Node 24.19.0 and Corepack pnpm
  10.19.0 were confirmed. Migrations 0001–0009 and package/lockfile are unchanged.
  Full frozen-install repository checks and browser coverage remain CI work.
- PR #63 initial CI failed the Nx circular-dependency check: the new database
  integration test imported importer code, creating a graph cycle despite the
  per-test lint exception. Moved the import-replay regression to the importer
  suite, preserving importer-to-database direction without weakening rules.
  Local rerun passed 215/215 cases across fourteen files (including the complete
  importer integration suite); targeted TypeScript and diff checks passed.
  Plan-operation cases are now 17; the eighteenth moved to the importer suite.
- GitHub Codex review of implementation commit 4981d67 completed with no findings.
