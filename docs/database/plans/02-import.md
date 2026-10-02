# DB-02 — Lossless Incremental Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available. Work sequentially, red/green tests first. No delegation unless requested.

**Goal:** Import main-library data from the unchanged spreadsheet into an isolated database, replay without duplication, and safely merge a newer export.

**Architecture:** XLSX → immutable private snapshot → normalized candidate → dry-run merge → audited transaction. Extraction never connects to the DB; application never edits the Sheet. Shared pure normalization/merge rules drive dry-run and apply.

**Tech Stack:** Node 24, TypeScript, ExcelJS 4.4.0, pg, Vitest, existing database harness.

**Spec:** execution contracts C–F; main spec §3.3, §11 and §12. Read these before implementing.

## Global constraints and review focus

All pack constraints apply. Synthetic fixtures are the CI default. Reading a private local workbook for a rehearsal does not authorize uploading it to Neon. Focus on raw loss, stale-source overwrite, replay/version churn, partially updated atomic groups, malicious input and concurrency. A failed/blocked field stays visible in a private report.

## Task 02.1 — Snapshot extractor and exact source contract

**Files:** `libs/importer/{project.json,tsconfig.json,vitest.config.ts,src/index.ts}`; `src/{contracts.ts,headers.ts,extract-xlsx.ts,canonical-json.ts,manifest.ts}` under importer; matching `*.spec.ts`; `tools/database/extract.ts`; synthetic fixtures under `tests/fixtures/database/`.

**Interfaces:**

```ts
export async function extractWorkbook(input: {
  sourcePath: string;
  outputDirectory: string;
  sourceKey: string;
  effectiveAt: string;
  freshnessApprovedBy: string;
}): Promise<SnapshotManifest>;
export function canonicalJson(value: Json): string;
export function sha256Utf8(value: string): string;
```

- [ ] Add exact ExcelJS dev dependency, server-only importer Nx project/tags and TS alias. It is tooling, not a browser dependency.
- [ ] Declare the seven sheet header arrays as constants. Main sheet (35):

```ts
export const MAIN_HEADERS = [
  'Title',
  'Author',
  'Series',
  'Platform',
  'Status',
  'Read?',
  'Liked',
  'Year Finished',
  'Opinion',
  'Notes',
  'Cover URL',
  'Next Rank',
  'Why Next',
  'Pros',
  'Cons',
  'Next Slot',
  'Community Rating',
  'Ratings Count',
  'Rating Source',
  'Rating Updated',
  'Personal Relevance',
  'Relevance Reason',
  'Relevance Updated',
  'Book ID',
  'Updated At',
  'Updated By',
  'Series Volume',
  'Series Published',
  'Series Planned Total',
  'Series Status',
  'Series Checked',
  'Genre',
  'Finished Date',
  'Added At',
  'Word Count',
] as const;
```

Other headers:

- Author Highlights: Author, Rank, Title, Series, First Published, Cover URL, Source URL, Source, Updated.
- Book Quotes: Book ID, Quote, Attribution.
- Series Catalog: Series, Volume, Title, Author, Source URL.
- Book Comparisons: Event ID, Event Type, Client Request ID, Pair Key, Book A ID, Book B ID, Outcome, Compared At, Session ID, Target Event ID, Actor, Algorithm Version.
- Book Rankings: Book ID, Rank, Preference Strength, Standard Error, Effective Decisions, Distinct Opponents, Provisional, Calculated At, Algorithm Version, Data Revision.
- Book Recaps: Book ID, Title, Author, Status, Verified At, Edition, Quick Refresher, Characters and Key Figures, Cheat Sheet, Full Story, Series Handoff, Sources, Paragraph Sources, Reason, Updated At.

- [ ] Map by unique exact header name, not position. Reordered columns are accepted. Missing required identity/core headers, duplicates or missing required sheets block apply. Missing optional fields produce diagnostics and preserve DB fields. Unknown headers/sheets stay in snapshot evidence and are reported as unmapped, never automatically become database columns.
- [ ] Preserve original bytes, SHA-256, workbook date-system flag, formulas/cached values, cell types, rich-text runs, number formats, blanks and row coordinates. Workbook bytes are the ultimate lossless record; do not claim an interpreted JS Date reconstructs original XML. Convert JS Date to explicit tagged ISO value in evidence, not ambient locale.
- [ ] Source/output realpaths: input must be a regular `.xlsx`; output must not equal input or lie inside the tracked repo for private data; require new output directory or identical existing source hash. Refuse overwrite of different evidence. Set newly created private files 0600/directories 0700. Limits: source ≤25 MiB; ≤10,000 populated rows per sheet; ≤100 columns; ≤1,000,000 characters per cell; exceeded limits fail without partial accepted snapshot.
- [ ] Do not execute formulas/macros, external workbook links, hyperlink fetches or network calls. A formula in a required import field requires an explicitly reviewed cached-value policy; no cache or stale/unknown cache blocks that field. Keep original evidence regardless. Reject merged cells intersecting required tabular columns rather than silently filling down.
- [ ] Write `source.xlsx`, `manifest.json`, `rows.jsonl`, `extraction-report.json` to private output. Snapshot verification recomputes source hash, rows hash and manifest schema before import; row payloads cannot be swapped without detection. Add `rowsSha256` to manifest type and config validation.
- [ ] Script: `db:extract` → `tsx tools/database/extract.ts`. Interface:

```text
pnpm db:extract --source-file /private/approved/library.xlsx --out /private/approved/snapshot-001 --source-key thiago-library-sheet --effective-at 2026-09-20T12:00:00Z --freshness-approved-by owner
```

The example time is illustrative, not approved freshness. Required real execution inputs come from the actual export/capture. `--help` explains each field. There is no live Sheets writer or credential-dependent extraction in this ticket.

- [ ] Tests: header reordering/missing/duplicates, numeric title 1984, original whitespace/newlines/Unicode, typed dates for 1900/1904 systems, formula missing cache, rich text, unknown column, merged cells, invalid extension/oversize file, manifest tampering, output overwrite and zero network requests.

## Task 02.2 — Deterministic normalization and quarantine

**Files:** importer `src/{normalize-book.ts,parse-dates.ts,parse-numbers.ts,lookup-keys.ts,aliases.ts,issues.ts}` plus unit tests; synthetic JSON fixtures with no real prose.

**Interfaces:**

```ts
export type CandidateField =
  | { kind: 'value'; value: Json }
  | { kind: 'blank' }
  | { kind: 'absent' }
  | { kind: 'invalid'; code: string };
export type BookCandidate = {
  stableId: string;
  fields: Record<string, CandidateField>;
  authorKeys: string[];
  genreKeys: string[];
  issues: Issue[];
};
export function normalizeBook(row: SourceRow, manifest: SnapshotManifest): BookCandidate;
export function parseCompletion(
  finished: CellEvidence,
  year: CellEvidence,
  dateSystem: '1900' | '1904',
): { value: Json | null; issues: string[] };
```

- [ ] Implement the full 35-column mapping. Record disposition for every cell: accepted, derived/evidence-only, empty, unresolved or invalid. Unknown columns are retained but not normalized.
- [ ] Stable ID must be a nonblank untrimmed exact identity from source; reject leading/trailing whitespace rather than silently changing it. Reject `::` and unsupported non-ASCII event-participating IDs; record source value privately. Source UUID and slug identity are equally valid. Do not generate IDs for source books.
- [ ] Title trims presentation padding but retains text including numeric `1984`. Native IDs are separate from title. Required platform/status must match allowed vocabulary; missing is not automatically Unknown/unread.
- [ ] Ratings: recognize decimal strings with optional terminal star glyph; reject commas, trailing prose, exponent notation, nonfinite and extra precision. `4.5⭐` → decimal string `4.5`. Word/count fields require unsigned integer syntax and range. Source ordinary text paragraphs remain verbatim; `🧹` opinion keeps opinion_raw and normalizes opinion to NULL with a sentinel issue.
- [ ] Dates: parse exact day, month, year, same-month day range, month range with real calendar validation. `Finished Date` takes precedence. Text month/year in Year Finished proposes year plus original month context; source date-typed Year Finished proposes extracted year, never an invented day. For these legacy conversions emit `YEAR_CELL_COERCION` and require a reviewed resolution policy before canonical use. Conflicting years quarantine the whole completion group. No invalid optional date blocks unrelated books.
- [ ] All six known partial patterns have synthetic tests: `2026-03-05~06`, `2026-04~05`, `2026-05`, `2026-06`, `2026-07~08`, `2026-08-10~11`. Also test leap year, impossible February 30, reversed range, infinity and 1900 fake leap day serial. A plain five-digit numeric year is unresolved without workbook typing/date-system evidence.
- [ ] Parse HTTP(S) URLs with URL constructor, reject username/password, javascript/data schemes. No URL fetch. Invalid cover → quarantine; preserve existing valid DB cover on later import.
- [ ] Resolve ordered coauthors and genres using addendum E. Sentinel series labels retain raw value but no artificial series. Series count conflicts produce review issues; absent genre is a valid empty initial set but not an automatic later delete.

## Task 02.3 — Three-way merge and explicit resolutions

**Files:** importer `src/{merge-field.ts,merge-book.ts,resolutions.ts,plan-import.ts}` with exhaustive unit tests; DB `src/import-baselines.ts`.

**Interface and scalar decision kernel:**

```ts
type MergeResult = {
  action: 'keep' | 'write' | 'adopt' | 'conflict';
  value?: Json;
};
export function mergeValue(
  baseline: Json | undefined,
  incoming: CandidateField,
  current: Json,
): MergeResult {
  if (incoming.kind !== 'value') return { action: 'keep' };
  const same = (a: Json, b: Json) => canonicalJson(a) === canonicalJson(b);
  const next = incoming.value;
  if (baseline === undefined) {
    if (same(current, next)) return { action: 'adopt' };
    return current === null ? { action: 'write', value: next } : { action: 'conflict' };
  }
  if (same(next, baseline)) return { action: 'keep' };
  if (same(next, current)) return { action: 'adopt' };
  return same(current, baseline) ? { action: 'write', value: next } : { action: 'conflict' };
}
```

This kernel does not decide clear authorization, freshness, required-field validity, source ownership or accepted-assessment protection; caller checks those before using it. Keep these checks in named functions and test them independently.

```ts
it.each([
  ['old', 'old', 'native', 'keep'],
  ['old', 'new', 'old', 'write'],
  ['old', 'new', 'new', 'adopt'],
  ['old', 'new', 'native', 'conflict'],
] as const)('three-way merge %s/%s/%s → %s', (b, i, d, want) => {
  expect(mergeValue(b, { kind: 'value', value: i }, d).action).toBe(want);
});
```

- [ ] Add tests for absent baseline, null vs empty string, invalid incoming preserving DB, blank preserving DB, source change in one field alongside a native edit in another, stable Book ID with changed title, source timestamp unchanged despite updated field, and accepted assessment protection.
- [ ] Atomic groups are indivisible. Decision table in addendum D is authoritative. A read status change must not erase older completion history or recap content implicitly.
- [ ] Validate reviewed resolution JSON strictly: expected source SHA, entity/group key, current hash/version, reviewer/time, action. Unknown keys/actions fail. Clear only nullable fields or explicitly replaceable collections; cannot clear stable ID, title, all authors or required status/platform.
- [ ] A replay of an applied run returns original result even if native DB fields changed afterward. Do not “restore” imported values. To resolve outstanding conflicts use new resolution config digest; never edit old audit rows to pretend a prior run succeeded differently.

## Task 02.4 — Dry-run/apply, audit and integration tests

**Files:** importer `src/{run-import.ts,stage.ts,apply-core.ts,report.ts}`; DB `src/import-writer.ts`; `tools/database/{import.ts,verify.ts}`; integration suites `import-replay`, `import-updates`, `import-failure`, `import-concurrency`.

**Interfaces:**

```ts
export async function runImport(
  input: {
    snapshotDirectory: string;
    scope: ImportScope;
    mode: 'dry-run' | 'apply';
    resolutionFile?: string;
    reportDirectory: string;
  },
  db: import('pg').Pool,
): Promise<ImportReport>;
```

- [ ] CLI commands:

```text
pnpm db:import --snapshot /private/approved/snapshot-001 --scope core --dry-run --report /private/approved/report-001
pnpm db:import --snapshot /private/approved/snapshot-001 --scope core --apply --report /private/approved/report-002
pnpm db:verify --scope core --run-id <returned-run-uuid>
```

Arguments containing `<...>` must be replaced with observed outputs, never copied literally. Require exactly one of dry-run/apply; default invocation without either prints usage and performs nothing. Credentials come only from `DB_IMPORT_URL`; local test harness injects synthetic role URLs.

- [ ] Dry-run is read-only against DB and writes only a new private report directory. It validates full snapshot, calculates changes, reports blocking errors/conflicts and zero mutation. Apply recomputes under addendum F's exclusive gate.
- [ ] Stage all seven sheets and preserve pending later scopes. Commit audit staging before domain transaction. In transaction check source head/freshness, lock parents, verify resolution expectations, apply lookup/books/children/baselines/provenance, set applied and advance head together. Numeric title or missing quote/recap never creates an extra book.
- [ ] Freeze all mutations to domain data if identity/event-source corruption detected for the current scope. Optional errors and conflicts preserve affected fields and produce nonzero report counts; no hidden drop. Explicitly distinguish not-yet-imported enrichment/events from rejected rows.
- [ ] Standard exit codes: 0 completed without open issues; 2 completed dry-run/apply with nonblocking review issues; 3 blocked before canonical commit; 4 execution/transaction failure; 64 invalid CLI usage. Print safe summary counts/status/runId only; detailed reports remain private.
- [ ] `verify` checks stable-ID set, no orphan links, all required authors, per-field provenance hashes, baseline consistency, accounted source rows, no unexpected public grants, and canonical content digest excluding identity sequence counters. It must not demand unchanged sequence values after a rolled-back insert; PostgreSQL sequences can advance on rollback.

### Integration acceptance scenarios

| Test                     | Setup/action                                            | Required result                                                           |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| I01 initial              | 3 synthetic books, one slug, coauthors, blank genre     | 3 books, exact IDs/links                                                  |
| I02 exact replay         | Same snapshot/config twice                              | Same IDs, counts, versions/timestamps and values                          |
| I03 concurrent replay    | Two connections apply same run                          | One canonical application, same returned outcome                          |
| I04 new book             | New snapshot adds one stable ID                         | Exactly one new book; no churn elsewhere                                  |
| I05 source update        | Change title/rating without source row timestamp change | Existing entity updated by field; no duplicate                            |
| I06 native preserved     | Native notes edit, unchanged incoming notes             | Native notes retained                                                     |
| I07 two-sided change     | Native and source alter same notes                      | Conflict, native value/baseline retained                                  |
| I08 blank/clear          | Blank source then reviewed clear                        | Blank does nothing; explicit clear applies only after expected-hash check |
| I09 old snapshot         | Effective source time older than head                   | Block apply; no value regression                                          |
| I10 stale resolution     | DB changed after review                                 | Block that resolution; no overwrite                                       |
| I11 rollback             | Inject failure after second synthetic book write        | No scope domain writes committed; staged evidence/failed audit retained   |
| I12 source disappearance | Remove book from newer export                           | No deletion/archive inferred                                              |
| I13 title collision      | Two IDs have identical titles                           | Two valid books remain                                                    |
| I14 group atomicity      | New finish year contradicts date                        | Completion group unchanged; warning recorded                              |
| I15 later scope          | Applied core export then enrichment run identity        | Not mistaken for an already applied enrichment run                        |
| I16 tampering            | Edit rows.jsonl or source after extraction              | Hash check blocks before staging/apply                                    |

- [ ] Run all tests twice with clean disposable DBs; run `pnpm check`, `pnpm test:db`, `pnpm test:e2e`, `git diff --check`.
- [ ] Optional approved private local rehearsal: fresh export, dry-run first; compare totals from its own manifest, not hard-coded 174/79. Do not commit its data/report. It is not needed to claim synthetic test success, but is required before eventual hosted real-data import.

## Task 02.5 — Deferred local population from the existing library

Requested by the owner on 2026-10-02. **Planned only; do not execute as part of DB-01.**
Use the owner's existing books rather than fictional demonstration records.

Source authority is documented in [spec §0](../spec.md#0-authority-scope-and-delivery-state)
and the [context ownership map](../context-map.md): the current Google Sheet owns the
prototype records; the original workbook and study belong to private context evidence.
The historical workbook is not proof of current Sheet contents.

- [ ] After DB-01 is independently accepted and the DB-02 importer is implemented and reviewed, locate the documented existing source and confirm its freshness with the owner. Use an immutable authorized export; do not request a duplicate dataset if the documented source is available.
- [ ] Run extraction and dry-run first, review source-specific diagnostics, then populate an explicitly selected private local database through the DB-02 importer. Do not bypass the importer with ad hoc seed SQL.
- [ ] Verify counts against that export, preserve original Book IDs, and demonstrate that replay creates no duplicates or unintended version changes.
- [ ] Keep source files, records and detailed reports outside Git, CI artifacts and public output. Leave the live Sheet and hosted database untouched.
- [ ] Record sanitized acceptance evidence and provide DBeaver connection instructions. Choose the local storage lifecycle explicitly: the DB-01 tmpfs harness is disposable and loses imported records when stopped/recreated.

Execution and actual private-data loading require a later explicit request. This task records
intent only; no source data has been read or imported by adding it.

Review follow-up (2026-10-02): the DB-01 importer role deliberately has direct DML; the
controlled importer must enforce accepted-assessment conflicts and update row versions,
provenance, accepted baselines and source heads atomically. Include a regression where an
accepted assessment differs from incoming source content: preserve the accepted content/review
unless an explicit reviewed resolution permits replacement; accepted replacement resets review.
See [independent review](../review/db-01-independent-review.md).

## Done / next

Done means the unchanged input shape works, all synthetic scenarios pass, and repeat imports plus source/native conflicts have evidence. The Sheet and hosted DB remain untouched. Prepare local description `feat(import): add lossless replay-safe core importer`. Stop for merge-policy review before DB-03.
