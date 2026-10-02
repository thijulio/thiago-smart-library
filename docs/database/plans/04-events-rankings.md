# DB-04 — Immutable Comparisons and Coherent Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available. Sequential red/green execution. Do not delegate unless requested.

**Goal:** Preserve comparison history exactly and provide atomic, repeatable append/replacement/undo and ranking rebuild operations.

**Architecture:** Append-only event table plus effective-decision projection. One ranking input-version row coordinates writers and atomic cache publication. Import replays supplied history; runtime replacement may append a Void plus Decision.

**Tech Stack:** SQL functions/triggers, pg transactions, TypeScript ranking port, Vitest multi-client PostgreSQL tests.

**Spec:** database §4.2/§4.3 and §12; execution contracts F. Pinned prototype ranking modules named in DB-00.

## Global constraints / review focus

All pack constraints apply. No public voting endpoint, scheduler, AI, or source writes. Critical cases: A/B reversal, retry after eligibility change, concurrent replacement, stale cache publication, and history accidentally deduplicated by pair.

## Task 04.1 — Event schema and historical replay

**Files:** `libs/database/migrations/0006_events_rankings.sql`; importer `src/{normalize-event.ts,apply-events.ts}`; DB `test/events-import.integration.spec.ts`.

- [ ] Implement every event column/nullability/check from spec §4.2, preserving event/request UUIDs. No unique constraint on pair_key. Void rows have only target and audit metadata, not duplicated participant fields.
- [ ] Trigger validates canonical pair from immutable text stable IDs under C collation; importer compares source pair exactly. Presentation order stays untouched. Restrict supported ID alphabet for this v1 event contract; fail unsupported non-ASCII rather than accepting locale-dependent ordering.
- [ ] Void target must be a previously ingested Decision; partial unique target index prevents second Void. Insert Decisions in source order, then Voids in source order; preserve original compared_at, not ingestion clock. Append-only UPDATE/DELETE/TRUNCATE triggers plus grants protect runtime history.
- [ ] On importing an existing event/request key compare full immutable payload including source timestamp. Equal is no-op; disagreement blocks entire events scope. Replay must not synthesize missing Voids or merge repeated pairs.
- [ ] Test exact payload replay, collision with different outcome/time/actor, malformed UUID, same-book event, wrong pair, Void→Void/self/missing target, duplicate Void, repeated pair accepted, reversed A/B outcome preserved. Enrichment/records already imported remain unaffected if events scope fails.

## Task 04.2 — Trusted owner decision and undo operations

**Files:** `0007_event_operations.sql`; DB `src/comparisons.ts`, `test/events-concurrency.integration.spec.ts`.

**Interfaces:**

```ts
export type DecisionInput = {
  requestId: string;
  bookAStableId: string;
  bookBStableId: string;
  outcome: 'A' | 'B' | 'Tie';
  sessionId: string;
};
export type EventResult = {
  decisionId: string | null;
  voidId: string | null;
  replayed: boolean;
};
export async function recordDecision(client: SqlClient, input: DecisionInput): Promise<EventResult>;
export async function undoDecision(
  client: SqlClient,
  input: { requestId: string; targetEventId: string },
): Promise<EventResult>;
```

SQL routines `library.record_decision(request_id uuid,book_a_stable_id text,book_b_stable_id text,outcome text,session_id uuid)` and `library.undo_decision(request_id uuid,target_event_id uuid)` return JSON matching EventResult. Actor comes from session_user identity; algorithm comes from trusted configured routine version. Client cannot set actor/server timestamp.

- [ ] Under shared import gate, lock ranking_state, then ordered books, then target event. Resolve matching recorded request before current eligibility checks. A successful retry after the book becomes unread must return its original result.
- [ ] For a new vote on an already-active pair, append Void targeting selected active decision and new Decision in one transaction. If historic import contains more than one active event for that pair, do not arbitrarily select one: return `AMBIGUOUS_ACTIVE_PAIR` and require an explicit target resolution. History remains untouched.
- [ ] Generate internal Void UUID/request UUID server-side exactly once; persist all output IDs in owner_requests for stable retries. Outcome comparison uses ordered A/B, not normalized pair alone. Unique-request races re-read and compare winning semantic payload.
- [ ] New decisions require both active read books. Undo may target an existing eligible historical decision even if current book status changed; identity and single-Void constraints still apply. Missing/already voided target gets a defined conflict response unless this is an identical request replay.
- [ ] Editor has EXECUTE only. Direct INSERT/UPDATE/DELETE/TRUNCATE all denied; importer has historical INSERT with integrity triggers but no mutation of old events. No SECURITY DEFINER function accepts a caller-selected schema/role/search_path.

### Barrier-based concurrency tests (not sleeps)

- [ ] Two clients same request/payload → one logical decision, both receive same IDs.
- [ ] Same request/different payload → one succeeds, other `REQUEST_CONFLICT`.
- [ ] Two replacements same pair → serialize; no two new active runtime decisions, no orphan Void; each committed transaction is complete.
- [ ] Undo race → single target Void. Same request retry is success, distinct losing request reports conflict.
- [ ] Status change vs decision → both follow same locks; vote cannot commit as newly eligible after an earlier status transaction made book unread.
- [ ] Inject failure after generated Void before new Decision → neither event commits; prior effective decision survives.

Use two checked-out clients and explicit promises/barriers around lock acquisition. Assert one is blocked using a bounded third-connection lock observation or operation completion barrier, not arbitrary 500ms sleeps. Timeout is failure, not a skipped test.

## Task 04.3 — Ranking engine compatibility and hashes

**Files:** domain `src/lib/{ranking-engine.ts,ranking-revision.ts}` and tests; `docs/database/reference/ranking-compatibility.md`; DB `src/rankings.ts`.

**Interfaces:**

```ts
export type RankingBook = {
  bookId: string;
  title: string;
  status: string;
  archived: boolean;
};
export type RankingEvent = {
  eventId: string;
  eventType: 'Decision' | 'Void';
  clientRequestId: string;
  bookAId: string | null;
  bookBId: string | null;
  outcome: 'A' | 'B' | 'Tie' | null;
  targetEventId: string | null;
};
export function rankingRevision(events: RankingEvent[]): string;
export function bookInputsRevision(books: RankingBook[]): string;
export function rankBooks(
  books: RankingBook[],
  events: RankingEvent[],
): {
  bookId: string;
  rank: number;
  strength: number;
  standardError: number;
  effectiveDecisions: number;
  distinctOpponents: number;
  provisional: boolean;
}[];
```

- [ ] Port pinned Bradley–Terry implementation with lambda=1, tolerance=1e-6, maxIterations=12. Capture reference results on synthetic fixtures BEFORE porting. Do not implement a “simpler Elo” replacement. Record original hashes and adaptation rationale.
- [ ] Hash effective events with original stable IDs using prototype signature field order and `\u001f`/`\u001e` separators. Do not substitute surrogate IDs, round numbers or include voided decisions in this event revision.
- [ ] Pin tie-break comparison with `Intl.Collator('en',{usage:'sort',sensitivity:'variant',numeric:false})`, then stable ID C/ASCII order. Version new algorithm `bradley-terry-l2-lambda1-v2-en`; record Node/ICU version in evidence. Document any differences from prototype's ambient locale; never claim bit-identical rank order without testing.
- [ ] `bookInputsRevision` hashes canonical JSON of eligible active read `(bookId,title)` records sorted by stable ID. Archived/reading/wishlist books are excluded. Empty input hashes a canonical empty array.
- [ ] Tests: no books, one book, no votes, tie, reversed presentation, disconnected components, repeated historical pair, voids, nonfinite failure, PT accents/identical titles, ineligible participant history retained but filtered consistently for ranking calculation. Compare floating scores to reference within absolute 1e-6; exact ranks must match under the declared tie-break.

## Task 04.4 — Atomic cache and invalidation everywhere

**Files:** `0008_ranking_publication.sql`; DB `src/{ranking-snapshot.ts,ranking-publish.ts}`, `test/rankings.integration.spec.ts`; modify owner/import writers; `tools/database/rankings.ts`.

- [ ] Create ranking_state singleton and book_rankings from spec. State checks require all computed metadata for ready and `computed_input_version=input_version`; stale may retain a previous cache. Seed singleton once.
- [ ] Retrofit create/title/status/archive/event/undo/import writes to lock ranking_state after import gate and invalidate in the SAME transaction when relevant inputs actually change. No-op import/patch does not invalidate. Historical event import increments once per applied batch; effective identical replay increments zero times.
- [ ] Rebuild reads books, events and version from one read-only repeatable-read transaction, releases it, computes outside write locks. Publish obtains shared import gate then ranking_state FOR UPDATE. If version differs return `STALE_INPUT`, no cache changes; retry entire capture at most twice.
- [ ] One publication transaction replaces all rows and state metadata. Zero eligible books produces ready state with zero rows and valid hashes, not an ambiguous absent state. New algorithm deployment marks old cache stale before public consumers enable it.
- [ ] Grant ranking_worker only input reads and EXECUTE on `library.publish_rankings(expected_input_version bigint,payload jsonb,algorithm_version text,data_revision text,book_inputs_revision text)`. Validate unique/contiguous positive ranks, full eligible book coverage, finite numbers and identical metadata. Caller cannot publish partial rows or private-data edits.
- [ ] CLI `pnpm db:rankings --rebuild` reads only DB_RANKING_URL and prints state/version/count without detailed private scores. `--status` is read-only.
- [ ] Tests force a title edit and a new vote between snapshot capture and publication: old candidate rejected, newest rebuild accepted. Reader under concurrent publication sees one complete revision. No-op writes leave state unchanged. All relevant writer paths have an explicit invalidation test.
- [ ] Reference Sheet rankings remain audit evidence. Real rehearsal reports order/score differences and reason, using 1e-6 numeric tolerance; it does not install Sheet scores as authoritative cache.

## Done / next

- [ ] `pnpm check`, `pnpm test:db`, `pnpm test:e2e`, `git diff --check` all pass. Record tests that actually used two DB clients and real role credentials.
- [ ] Every source event accounted for; repeat import does not change history. No private event exposed publicly.
- [ ] Prepare description `feat(database): preserve comparison history and coherent rankings`. Require concurrency/permission review before DB-05 rehearsal.
