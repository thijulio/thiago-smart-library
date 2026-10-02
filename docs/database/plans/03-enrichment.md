# DB-03 — Enrichment and Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available. Execute sequentially, with failing tests first. Do not delegate unless requested.

**Goal:** Preserve and import quotes, recaps, source references, author highlights and series catalogues without guessed identities or citations.

**Architecture:** Parent-owned collections and a provenance-validity state. Source evidence survives even when normalized references cannot be trusted. No publication in this ticket.

**Tech Stack:** TypeScript/Vitest, existing importer, SQL migrations, real PostgreSQL harness.

**Spec:** database §4.1, §5, §9, §11; execution contracts D/E.

## Global constraints / review focus

All pack constraints apply. No source edits, generated recaps, web fetching, auth or public API. Main risks: cross-book source links; source “verified” mistaken for valid; reordered quotes duplicating; source replacement destroying native text; unowned catalogue entries becoming owned books.

## Task 03.1 — Enrichment schema and permissions

**Files:** `libs/database/migrations/0005_enrichment.sql`; DB `test/enrichment.integration.spec.ts`; domain `src/lib/recap-contracts.ts`.

- [ ] Create quotes, recaps, recap_sources, recap_paragraphs, recap_paragraph_sources, author_highlights and series_catalog exactly from §4 plus source-owned collection and owner-review metadata in addendum E. Add `row_version bigint NOT NULL DEFAULT 1 CHECK(row_version > 0)` to mutable recap parent and a group-baseline version to source-owned collections; derived child rows do not each need independent edit versions.
- [ ] Quotes have nonblank text, book FK, source/native ownership and unique `(book_id,position)`. Foreign keys stay RESTRICT except the allowed derived recap cascades. Raw prose columns and source metadata remain private.
- [ ] Composite recap FKs prevent paragraph/source references crossing books. `validation_state` defaults needs_review. Verified source status does not default to valid. Trusted replacement clears validation first, rebuilds children, validates, then marks valid atomically.
- [ ] Add `import_audit.collection_baselines(source_key,collection_kind,parent_key,source_payload jsonb,source_sha256,accepted_run_id)` with composite PK. Store complete ordered normalized payload, including repeated occurrences; hashed summaries alone are insufficient to report what changed. Restrict access like field_baselines.
- [ ] Extend role grants narrowly. Public reader still sees no enrichment data. Importer may populate scoped tables; editor cannot directly edit derived paragraphs/sources/edges.
- [ ] Red/green tests: cross-book edge, duplicate child position, invalid URL scheme, missing parent, unauthorized direct child write, no native collection deletion during source replacement.

## Task 03.2 — Versioned recap validator

**Files:** importer `src/{normalize-recap.ts,validate-recap.ts}`; domain `src/lib/recap-contracts.ts`; tests `normalize-recap.spec.ts`, `validate-recap.spec.ts`; reference manifest `docs/database/reference/prototype-contracts.md`.

**Interfaces:**

```ts
export type RecapCandidate = {
  stableId: string;
  sourceStatus: 'verified' | 'summary' | 'pending' | 'deferred';
  validationState: 'valid' | 'needs_review';
  paragraphs: { position: number; body: string }[];
  sources: { position: number; title: string; url: string }[];
  edges: { paragraphPosition: number; sourcePosition: number }[];
  raw: Record<string, string>;
  issues: Issue[];
};
export function normalizeRecap(row: SourceRow): RecapCandidate;
export function validateRecap(candidate: RecapCandidate): Issue[];
```

- [ ] Port pure semantics from the pinned prototype `src/recap-catalog.mjs`; record commit and SHA-256 of original file. Do not import from an absolute sibling path. Use synthetic fixtures with generated neutral prose, not copied personal recaps.
- [ ] Split story on blank lines `/\r?\n\s*\r?\n/`, preserving each paragraph's text/order. Named character lines use `—`; sources split at the last such separator; paragraph source indices are comma-separated positive integers, one line per story paragraph. Convert to DB one-based positions with no off-by-one shift.
- [ ] `summary`: valid date/refresher/prose/source mapping, 80–399 whitespace-separated words, no cast/cheat-sheet/handoff/reason content. `verified`: valid date/refresher, nonempty cast and cheat sheet, 400–1760 words, named HTTP(S) sources and references for every paragraph. Strict real calendar dates supplement the old Date.parse-only check.
- [ ] `pending`/`deferred` require reason and do not expose prose. Preserve any unexpected source prose privately with issue. None of these structural checks claims factual/source verification.
- [ ] Malformed narrative citations such as `Full Story ¶1–2: 1, 3` are not parsed as automatic trusted edges. Retain prose/sources as feasible, mark whole recap needs_review, and withhold disputed edges. There is no title-based special case.
- [ ] Tests include: fewer/more source lines; same number but nonnumeric labels; out-of-range references; zero/negative/fraction index; empty paragraph reference; duplicate refs (deduplicate within a paragraph deterministically and report); cross-book source attempt; one-newline paragraph; exact word-count boundaries; invalid date; pending prose; unsafe URL.

```ts
it('does not infer provenance from descriptive source prose', () => {
  const row = syntheticRecapRow({
    fullStory: syntheticWords(450),
    paragraphSources: 'Full Story: Source A; Source B',
  });
  const result = normalizeRecap(row);
  expect(result.validationState).toBe('needs_review');
  expect(result.edges).toEqual([]);
  expect(result.raw['Paragraph Sources']).toContain('Full Story:');
});
```

Define `syntheticWords(n)` as `Array.from({length:n},(_,i)=>'word'+i).join(' ')`. `syntheticRecapRow` builds all fifteen header-aligned cells, synthetic identity/title/author, two `Source A — https://example.com/a` source lines, valid date and required figure/cheat-sheet data. It returns SourceRow so this test exercises the real parser.

## Task 03.3 — Parent-scoped collection reconciliation

**Files:** importer `src/{reconcile-collection.ts,normalize-quotes.ts,normalize-highlights.ts,normalize-series-catalog.ts,apply-enrichment.ts}` plus tests; DB `src/enrichment-writer.ts`.

**Interface:**

```ts
export function reconcileCollection(input: {
  baseline: Json[] | undefined;
  incoming: Json[] | undefined;
  currentSourceOwned: Json[];
  currentNative: Json[];
  removalApproved: boolean;
}): {
  action: 'keep' | 'replace' | 'adopt' | 'conflict';
  sourceRows?: Json[];
  reason?: string;
};
```

- [ ] Treat each parent's quote list, recap aggregate, author highlight set and series catalogue set as an atomic merge group. Undefined incoming is absent; an empty incoming group is not automatically a delete.
- [ ] If incoming equals baseline, keep current. If incoming equals current source-owned payload, adopt baseline without row churn. Source-only change replaces source-owned group when no removals are involved; removals require a reviewed group resolution. Both changed → conflict and retain current rows.
- [ ] For quotes, source segment comes first in source order; native entries follow in their existing relative order. Replacement may change source-owned surrogate quote IDs, but never native IDs. Do not expose source-owned quote IDs as stable external references. Unique positions are rebuilt inside a transaction, not by unsafe in-place conflicting swaps.
- [ ] Repeated identical quote occurrences remain distinct. Do not collapse by text hash or `(book_id,text)`. A replay of unchanged group preserves its IDs/positions. Parent disappearance does not remove groups.
- [ ] Highlights use `(author,rank)` and catalogue `(series,volume)`. Native slot collisions are conflicts, not automatic renumbering; rank/volume carry meaning. Resolve author aliases before keys; unknown/multi-author catalogue references are quarantined with the original string, never truncated to one person.
- [ ] Imported valid recap replacing unchanged source recap is allowed; a native edited or owner-reviewed recap is protected and needs an explicit expected-version resolution. Any content/reference change invalidates validation until rebuilt. Report source-status counts and validated/publication-eligible counts separately.
- [ ] Implement `runImport --scope enrichment` using its own run identity. It requires corresponding core source head and successful identity mapping; it cannot read a random fresh export while core remains on old identities. Rows not yet handled stay in staging.

## Task 03.4 — Integration acceptance

- [ ] Initial synthetic enrichment import creates expected parent/source/paragraph/edge counts; second run changes none.
- [ ] Reorder two quotes on a newer source, replay again: two source occurrences remain, no duplicates; native quote unchanged.
- [ ] Remove a source quote without reviewed replacement: group preserved and conflict/diagnostic emitted. Same operation with expected-hash reviewed replacement succeeds.
- [ ] Reordered rows in another book cannot attach quotes to the wrong parent. Orphan Book ID blocks enrichment identity application, while a malformed optional source URL quarantines that record.
- [ ] Source “verified” with bad mapping becomes needs_review, retaining all raw prose and no guessed links. Corrected mapping under a new approved snapshot/config can become valid.
- [ ] Force failure after deleting derived recap children: transaction rollback restores complete previous aggregate, including validation/version and source baselines.
- [ ] Catalogue/highlights import cannot increase personal books count. Multiple source aliases resolve to one reviewed author with expected link positions.
- [ ] Private reader can inspect diagnostics; public reader cannot access raw data or recaps. No HTTP publication in DB-03.
- [ ] Run `pnpm check`, `pnpm test:db`, `pnpm test:e2e`, `git diff --check`. With authorized real local data, emit reconciled accepted/quarantined/raw counts from that snapshot; do not enforce the old 397/239/3 figures on a newer export.

## Done / next

All enrichment is accounted for as accepted or explicit quarantine; no external calls, source edits or publication. Prepare local description `feat(import): preserve enrichment and validate recap provenance`. Review collection and provenance rules, then continue to DB-04.
