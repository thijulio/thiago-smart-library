# Refresh Lifecycle Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this slice and request one independent final review.

**Goal:** Define and test bounded, generation-fenced refresh transitions for #51.

**Architecture:** A pure domain policy operates on caller-supplied snapshots and
time. A later PostgreSQL adapter must serialize and persist transitions and
coordinate publication; this slice adds no worker or durable queue.

**Tech Stack:** Node 24, pnpm 10.19.0, TypeScript, Vitest.

**Spec:** [Lifecycle design](../specs/2026-11-11-refresh-lifecycle-design.md).

## Global constraints

- Preserve package manifests, lockfile, Biome and existing migrations.
- No model calls, hosted operations, new credentials or imported-source writes.
- Keep authorization and input hashing in server/database boundaries.
- No page-view scheduling, result deletion or changes to Reading's queue.

## Review focus

1. Identical identifiers in different libraries never share work or claims.
2. Obsolete work cannot complete after new input, retry or lease reclamation.
3. Duplicate events and expired leases cannot evade the three-attempt limit.
4. Retry/expiry boundaries and unsafe clock/counter values fail predictably.
5. A pure policy must not be described as atomic persistent publication.

## Task 1: Lifecycle policy

Files: `libs/domain/src/lib/refresh.ts`, `refresh.spec.ts`, domain exports.

Interfaces:

- `enqueueRefresh(current, request, now): RefreshJob` coalesces equivalent input.
- `claimRefresh(job, now): { job: RefreshJob; claim: RefreshClaim | null }`.
- `finishRefresh(job, claim, outcome, now): RefreshJob` fences completions.
- `RefreshRequest` names library, typed target, input fingerprint and optional
  explicit failed-job retry. `RefreshOutcome` is success, retryable or permanent
  failure; private provider messages are not accepted.

- [x] Write tests for scope/key collisions, event coalescing, input supersession,
      restart from a JSON snapshot, retry timing, permanent/exhausted failure,
      reclaimed/expired/foreign claims, duplicate completion and input immutability.
- [x] Run the domain suite red against executable empty implementations.
- [x] Implement pure transitions and the spec's fixed bounds. Add public exports.
- [x] Run the complete domain suite, TypeScript, formatting and diff checks.
- [x] Request independent source review; address important findings.
- [x] Commit and verify complete package acceptance in CI before merge.

## Execution ledger

- Baseline `076b8cc`; owner approved ready merges and continued work.
- Full frozen local installation fails with HTTP 401 for the published Biome
  package because NPM_TOKEN is not configured. Do not remove or replace Biome.
- Exact isolated public test tooling is installed outside the repository at
  `/workspace/scratch/smart-library-tooling`; isolated checks are not pnpm check.
- Pre-flight: existing storage uses decimal bigint revision strings; lifecycle
  generations use the same bounded representation. Storage publication remains
  the authority; lifecycle completion alone must never publish a result.
- Red: 12 new lifecycle tests failed with NOT_IMPLEMENTED; 18 existing domain
  tests passed. Green: all 30 tests across four files passed with Vitest 4.1.11.
  Isolated domain TypeScript 5.9.3 passed. This is not full application acceptance.
- Independent read-only review found no Critical/Important issues and considered
  this slice ready for PR. Deferred minor test coverage: completion before lease
  start, identical events during retry wait and invalid clocks through claim/
  completion. The implementation handles these paths; this receipt does not
  represent them as explicitly tested.
- Remaining #51 work is the durable adapter, transactional input-event hooks,
  fenced publication, worker/provider contract, spend/privacy review and private
  queue status. No running refresh system or completed #51 is claimed here.
- Code commit `f657cb2`, PR #64: CI run 42988002746 passed frozen install,
  pnpm check and browser E2E. Database run 42988002842 passed pnpm check and
  both complete disposable-suite repetitions on PostgreSQL 16.15 and 18.6.

## Next adapter handoff — not implemented

The next useful slice is durable target registration and lifecycle persistence,
with plan deferral as its first transactional event hook. Persist an explicit
validated selector per registered target: existing policies do not store the
selected fields/books/dependency revisions, and requiring an accepted revision
would prevent the first calculation. Retain the captured input fingerprint,
expected output head and complete lifecycle snapshot with the registration.

Reuse the existing publication lock hierarchy: READ COMMITTED, shared import
gate `(73421,2)`, request identity, library context, sorted book/stream locks,
then sorted job locks. Claims must acquire library context before job rows.
Discover candidate IDs without holding a job lock; locking with SKIP LOCKED and
then acquiring context reverses event-hook order. Revalidate after locks.

Deferral insertion must enqueue that platform's registered plan in the original
transaction; exact receipt replay returns before enqueue. Add other hooks only
with explicit input selectors: result/plan policy changes, accepted preference
changes, dependency publication and importer/native input changes. Pending
inferences alone do not change accepted taste evidence. Dependency revision
replacement must be explicit, not guessed from an arbitrary event.

Atomic publication must lock and validate the live claim, then run existing
expected-head/input publication and save job success/receipt in one transaction.
Use clock_timestamp() after lock waits for lease validity, not transaction-start
now(). Preserve replay recovery for a client disconnect after unknown commit.
Reacquiring locks through an outer wrapper must not reverse the existing order;
refactor internal routines or pre-acquire the complete hierarchy consistently.

The next integration tests must cover competing claims, supersession while a
calculation runs, a blocked completion that expires before its lock is acquired,
deferral rollback/replay, cross-library denial, unchanged-input retry budgets and
publication rollback preserving the prior head. Keep offline tooling outside
Nitro/browser imports; choose a reviewed server-only worker boundary before
runtime wiring. No provider or hosted execution is implied by this handoff.
