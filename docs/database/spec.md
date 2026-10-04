# Thiago Smart Library — database structure and migration contract

> Canonical implementation contract. The [execution addendum](plans/execution-contracts.md) takes precedence wherever it supplies more specific rules.
> Promotion: 2026-10-02; sanitized from the private 2026-09-20 study. Delivery status lives in GitHub milestones.
>
> Revision: 2026-09-20. Architecture recommendation and implementation contract.
> PostgreSQL on Neon is selected and connectivity has been delivered. This
> document specifies the application schema and import behavior; it does not
> establish that either has been deployed. Snapshot observations, design rules,
> and remaining implementation gates are distinguished below.

## 0. Authority, scope, and delivery state

This document is the revised contract for the database implementation. It
supersedes conflicting recommendations in the earlier
schema design (private historical provenance, not an execution input). The existing
SQL prototype (private historical provenance, not an execution input) predates this revision and **must not be
applied as the implementation of this contract**. Section 13 enumerates the
required differences; its previous local smoke test does not validate them.

The data profile (private historical provenance, not an execution input) describes a historical
export. The Google Sheet still owns the live prototype's records until an
explicit cutover. Smart Library's future canonical store is PostgreSQL.
This is initially one personal library, with one authorized owner. Multi-user
tenancy, multiple editions/copies per library record, and reading-session
history require separate extensions rather than being inferred from this export.

Confirmed operational evidence: [PR #3](https://github.com/thijulio/thiago-smart-library/pull/3)
merged as `3841213f6db5ee8bf98620094e2a2ac10881b8ac` on 2026-09-19;
the production database health endpoint returned HTTP 200 after `SELECT 1`
in that delivery session. This proves connectivity at that time, not application
tables, imported data, least-privilege roles, or ongoing availability.

The companion design records `text-embedding-3-small`, 1536 dimensions, as the
chosen embedding model, with backfill disabled. Preserve that recorded choice
as the starting candidate, subject to the retrieval evaluation in §10.
Vector storage and retrieval belong to a separate optional migration (§10);
they are not a prerequisite for importing personal records. No credentials,
provider calls, schema application, or live Sheet changes are part of editing
this document.

Project routing was reconciled during DB-00. Historical empty/unconnected observations do not override the verified Git baseline. Current cloud availability was not checked in DB-00.

### 0.1 Architectural judgement on the preliminary analysis

The earlier artifacts describe source data well, but their schema is input to
this design, not an approved architecture that must be copied. Distinguish
observations (what the export contains), product contracts (what must survive),
and implementation choices (what we choose to build). This revision recommends:

| Preliminary choice                                                   | Decision                                          | Reason / tradeoff                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL with separate entities and join tables                    | Keep                                              | Identity, ordered coauthors, provenance, and event integrity are relational problems; no separate document/vector store is needed for v1                                               |
| Surrogate ID plus original Book ID                                   | Keep                                              | Preserves external references while decoupling internal joins; smaller keys are a secondary benefit, not a scaling requirement for 174 books                                           |
| One large `books` row for identity, feelings, and generated analysis | Replace with a small aggregate                    | `books` owns library state; `book_feedback` owns private personal content; `book_assessments` owns inferred evaluations. This gives writers distinct permissions and update lifecycles |
| Whole-row last editor as evidence of AI authorship                   | Reject                                            | Use field attribution with an explicit unknown state; editing a title does not make a person the author of an AI explanation                                                           |
| Four spreadsheet sentinels become a `series_kind` enum               | Reject, including the first revision's suggestion | These labels mix genre, work form, and absence of a series. Store no fake series, preserve the original label, and avoid turning dirty source vocabulary into a domain taxonomy        |
| Read/recap/ranking/event sets must always be equal                   | Reject                                            | Their equality is a historical observation. New reading and later status corrections break it without invalidating historical content                                                  |
| Date plus precision only                                             | Replace                                           | Inclusive uncertainty bounds plus raw values retain the actual month/range                                                                                                             |
| Best-effort recap citation mapping                                   | Reject                                            | A wrong citation is false provenance; ambiguous mappings remain private and reviewable                                                                                                 |
| Every embedding field gets an HNSW index immediately                 | Defer                                             | No current semantic-search workload justifies index selection; exact search is the first benchmark                                                                                     |
| Recorded embedding model is a permanent database commitment          | Reject                                            | Preserve the recorded candidate and dimension, but require multilingual retrieval evaluation before activation; model changes need new embeddings                                      |
| Full work/edition/copy catalog and multi-user ownership now          | Defer                                             | The source identifies personal records without reliable edition identifiers; a library-wide bibliographic system would require invented matches                                        |
| Rebuild ranking data from immutable events                           | Keep, strengthen                                  | Add coherent publication and eligibility invalidation; an old spreadsheet ranking is evidence, not automatically a current result                                                      |

This is a bounded single-owner design, not a universal library platform.
Implement only the slice being delivered (§12.1). Source preservation prevents
data loss; it does not require exposing every legacy column as a product feature.
The optional AI layer must remain replaceable and must never become the owner
of personal reading state or feedback.

### 0.2 Artifacts considered and their limits

| Input inspected                                        | How it informs this revision                                                                                        | Limitation challenged                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-09-19-library-data-profile.md` and `profile.txt` | Source counts, headers, missingness, corrupt cells                                                                  | Non-UUID Book IDs are valid stable text keys; they do not inherently break referential integrity. Observed ranges are not permanent domain limits                                                                     |
| `2026-09-19-postgres-pgvector-schema.md`               | Candidate tables, recorded model choice, migration outline                                                          | Its hosting status is outdated, it conflates source/editor provenance, and it recommends indexes without a measured workload                                                                                          |
| `schema/schema.sql`                                    | Concrete draft to compare against intent                                                                            | CHECK/FKs alone do not make events append-only; broad views expose private fields; temporal and cross-book provenance constraints are incomplete                                                                      |
| `xlsx_profile.py` / `xlsx_integrity_probe.py`          | Original extraction/probe methodology                                                                               | Trimming, hard-coded temporary paths, cached-value assumptions, and inconsistent paragraph/status handling prevent treating these as a production importer                                                            |
| `lib_probe3.py` (historical temporary probe)           | Supplemental checks for coauthors, genres, pair order, ranges, and eligibility sets; located and read on 2026-09-20 | Reads preexisting temporary CSV dump CSVs without validating their source hash. It profiles a snapshot; it does not establish schema correctness, permissions, concurrent-write behavior, or canonical alias identity |
| `lib_probe2.py` (historical temporary probe)           | Additional exploratory integrity checks                                                                             | Same temporary-data dependency; single-newline paragraph counting does not express the recap parser contract                                                                                                          |
| Pinned workbook and live prototype parsers             | Independent recount and actual interpretation of records                                                            | Workbook is not a fresh live-Sheet read; prototype code is a compatibility reference, not a reason to copy its defects                                                                                                |

Temporary scripts are not portable evidence links and may disappear. The
durable input is the checksum-pinned workbook, the scripts already under
`evidence/`, and the documented measurement rules. A production importer must
accept explicit input/output locations and emit source checksum + transform
version with its report, rather than relying on temporary CSV dump state.

## 1. Historical export re-analysis summary

| Measurement                          | Value                                            | Structural consequence                                                |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| Books                                | 174                                              | `books` rows                                                          |
| Author names before alias resolution | 90 tokens (88 strings, split on `&`)             | Final canonical count depends on reviewed aliases                     |
| Co-authored books                    | 2 (synthetic examples `Book Alpha`, `Book Beta`) | N:M junction needed; 176 rows                                         |
| Distinct series                      | 46 real + 4 sentinels                            | `series` table; sentinels → `series_id NULL`                          |
| Distinct genres                      | 17                                               | `genres` + `book_genres`                                              |
| Multi-genre books                    | **11** (not 4)                                   | `book_genres` = 177 rows                                              |
| Quotes                               | 121 for 88 books (1–7 each)                      | `quotes` 1:N                                                          |
| Recaps                               | 79 = the 79 `read` books in this export          | `recaps` 1:0..1 keyed by book                                         |
| Comparison events                    | 614 = 606 decisions + 8 voids                    | `comparison_events` append-only                                       |
| Distinct books in comparisons        | 79 = exactly the `read` set in this export       | Eligibility is checked when recording a decision; history is retained |
| Rankings                             | 79 = the `read` set                              | derived cache                                                         |

These are reconciliation baselines, not hard-coded limits or universal
equalities. Eight books have no genre: `166 + 11 = 177` genre links.
`books ↔ authors` is N:M, even though most books currently have one author.

The workbook Thiago Library.xlsx (private historical provenance, not an execution input) was rechecked on
2026-09-20 using the existing profiler's read-only extraction logic:
SHA-256 `6818c71c60941311564beb3e0afefa02f9957a6ad448aa5046dfd7d72267f502`.
All seven sheet row totals, ID sets above, genre links, 90 split author names,
176 author links, 397 blank-line-delimited recap paragraphs, and the three
historical provenance-count mismatches (`RECAP_REFERENCE_COUNT_MISMATCH`) were independently recounted. This does not
verify that the live Sheet still equals this export.

`N. Gaiman`/`Neil Gaiman` and `T. Pratchett`/`Terry Pratchett` occur among the
split names. Do not promise 90 canonical author entities after reconciliation.
Likewise, 864 parsed source references is a historical candidate-edge count,
not an acceptance target for trusted paragraph-source links.

## 2. Entity model (tiers)

| Tier                 | Tables                                                                                                                    |                                                                             Row counts |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------: |
| Canonical library    | `books`, `book_feedback`, `authors`, `author_aliases`, `series`, `genres`, `book_authors`, `book_genres`                  |               174 books; 176 author links; 177 genre links before reviewed corrections |
| Inferred assessments | `book_assessments`                                                                                                        |          174 imported assessment bundles; individual field origins recorded separately |
| Enrichment           | `quotes`, `recaps`, `recap_sources`, `recap_paragraphs`, `recap_paragraph_sources`, `author_highlights`, `series_catalog` | 121 quotes; 79 recaps; 239 sources; 397 paragraphs; 332 highlights; 87 catalog entries |
| Event log            | `comparison_events`                                                                                                       |                                                          614 immutable imported events |
| Derived cache        | `book_rankings`, `ranking_state`                                                                                          |                            Rebuilt; 79 imported ranking rows retained as evidence only |
| Import audit         | `import_runs`, `import_rows`, `import_issues`                                                                             |                                             Determined by the source manifest; private |
| Field attribution    | `book_field_provenance`                                                                                                   |                                            Known attribution only; unknown is explicit |

The owning aggregate is a personal book record identified externally by
`stable_id`. It has zero or one current feedback row and zero or one current
assessment row; neither child owns its reading status. Children use the book's
surrogate PK as their FK/PK. Sparse values remain nullable. Do not create
placeholder child rows for a newly added book with no feedback or assessment.

`books` represents an existing personal library record, not a globally unique
literary work. `platform` retains the current single-value contract. There is
no uniqueness constraint on title, ISBN, or `(title, author)`. A catalog or
highlight row does not imply ownership and must never create a personal book
as a side effect. Future edition/copy or rereading support must retain Book IDs.

## 3. Column-level structure — the book aggregate

Source sheet: `Untitled` (35 columns). Some source columns become relations,
some become typed values, and all original cells remain in private import
evidence. There is no one-to-one source/target column-count requirement.

Conventions throughout this document: `!` means `NOT NULL`; unmarked fields
are nullable unless a key or conditional rule makes them mandatory. IDs are
`bigint GENERATED ALWAYS AS IDENTITY` unless a table explicitly uses a UUID,
shared book key, or composite key. Required text must also be nonblank.
Optional blank source cells normalize to NULL; source evidence retains their
original value. Use named constraints and lowercase snake_case identifiers.

Unqualified columns in the following table belong to `books`. Qualified
`book_feedback.*` and `book_assessments.*` rows belong to the respective child
table, not duplicate columns on books. Source-to-target mapping is explicit
in §3.3. All three tables follow the lifecycle/audit conventions in §4.

| Column                                    | Type                   | Constraint / domain                                                     | Data-derived justification                                                                             |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`                                      | bigint identity PK     |                                                                         | surrogate (see §6 D1)                                                                                  |
| `stable_id`                               | text                   | UNIQUE NOT NULL; immutable; nonblank; no `::`                           | Preserve all 162 UUID strings + 12 legacy slugs exactly; new records receive UUID strings              |
| `title`                                   | text                   | NOT NULL                                                                | 174 distinct (one is the digits `2048`)                                                                |
| `series_id`                               | bigint FK              | NULL for sentinels; RESTRICT deletion                                   | 46 real series; preserve sentinel semantics below                                                      |
| `series_label_raw`                        | text                   | Imported source label; never a genre/form enum                          | Retains real labels and all four sentinel spellings without claiming they share one semantic dimension |
| `series_volume`                           | numeric                | finite and > 0 when present; requires `series_id`                       | 98 filled; includes `2.5`                                                                              |
| `platform`                                | text                   | !; CHECK (`Audible`,`Kindle`,`Physical`,`Unknown`); no default          | 110/36/5/23; missing input is not silently treated as Unknown                                          |
| `status`                                  | text                   | !; CHECK (`read`,`wishlist`,`unread`,`reading`,`paused`); no default    | 79/55/37/2/1                                                                                           |
| `cover_url`                               | text                   | Valid HTTP(S) URL when present; malformed input is quarantined          | 161 nonempty cells, of which 159 are URLs and 2 contain unrelated text                                 |
| `word_count`                              | integer                | > 0 when present                                                        | 162 filled; unofficial 35th source column retained                                                     |
| `book_feedback.rating`                    | numeric(3,1)           | CHECK 0–5; PRIVATE by default                                           | parsed from `4⭐`…`3.5⭐`; 75 filled                                                                   |
| `book_feedback.opinion` / `opinion_raw`   | text                   | PRIVATE; preserve raw; no inferred meaning for `🧹`                     | For the 14 emoji-only cells, normalized opinion is NULL; prose remains verbatim                        |
| `book_feedback.notes`                     | text                   | PRIVATE; imported authorship may be unknown                             | 104 filled, avg 234 chars; AI-generated suggestions must not overwrite them                            |
| `book_assessments.pros` / `cons`          | text                   | PRIVATE; inferred assessment, not asserted user sentiment               | 174 filled each; unknown author/model metadata stays unknown                                           |
| `next_rank`                               | smallint               | > 0 when present; PRIVATE; not globally unique                          | 6 filled; 1–3 repeat across reading contexts                                                           |
| `next_slot`                               | text                   | CHECK (`Primary`,`Secondary`); PRIVATE                                  | 6 filled, all `Primary`                                                                                |
| `why_next`                                | text                   | PRIVATE                                                                 | 10 filled                                                                                              |
| `community_rating`                        | numeric(3,2)           | CHECK 0–5                                                               | 2 filled: 3.88, 4.2                                                                                    |
| `ratings_count`                           | bigint                 | >= 0 when present                                                       | Count, not a floating-point value                                                                      |
| `rating_source` / `rating_updated`        | text / date            |                                                                         | 2 filled: `Goodreads` / `2026-09-02`                                                                   |
| `book_assessments.personal_relevance`     | numeric(4,2)           | CHECK 0–10; PRIVATE                                                     | 174 filled; 3.0–10.0 (AI-derived)                                                                      |
| `book_assessments.relevance_reason`       | text                   | PRIVATE                                                                 | 174 filled                                                                                             |
| `book_assessments.relevance_updated`      | date                   | Source date, not a runtime generation claim                             | 174 filled; 5 distinct dates                                                                           |
| `finished_from` / `finished_to`           | date                   | Inclusive bounds; both NULL or both set; from <= to                     | Canonical typed representation; see §3.1                                                               |
| `finished_precision`                      | text                   | !; CHECK (`year`,`month`,`day`,`range`,`unknown`); DEFAULT `unknown`    | Precision is meaningful only with corresponding bounds                                                 |
| `finished_date` / `finished_year`         | derived date / integer | Read-only view fields, not separately editable columns                  | Exact day only for day precision; year only when both bounds have that year                            |
| `finished_date_raw` / `finished_year_raw` | text                   | PRIVATE                                                                 | Preserve both original cells, including ambiguous values                                               |
| `added_at`                                | date                   |                                                                         | 68 filled; **2018**–2026                                                                               |
| `source_updated_at` / `source_updated_by` | timestamptz / text     | PRIVATE; copied from source, never invented                             | Preserves Sheet audit independently of database writes                                                 |
| `created_at` / `updated_at`               | timestamptz            | !; DEFAULT transaction timestamp on insert; writer updates `updated_at` | Database lifecycle times; serialize UTC in API responses                                               |
| `updated_by`                              | text                   | !; PRIVATE; no default                                                  | Actual database writer, e.g. `import:<run-id>`; does not attribute every field                         |
| `row_version`                             | bigint                 | !; DEFAULT 1; > 0; increment on each canonical update                   | Optimistic concurrency; source timestamps are not write locks                                          |
| `last_import_run_id`                      | uuid FK                | PRIVATE; NULL for native records                                        | Links accepted imported values to the manifest                                                         |
| `archived_at`                             | timestamptz            | NULL means active; PRIVATE                                              | Retain records and event references without hard deletion                                              |

Numerical parsers must reject extra precision or non-finite input instead of
silently rounding it. Dates require calendar validation. CHECKs do not replace
NOT NULL. Require `series_volume IS NULL OR series_id IS NOT NULL`.
The four observed sentinel labels map to NULL series and volume, retaining
the original text in `series_label_raw` and raw evidence. An empty label means
unknown, not proven standalone. Native edits update `series_id`; they do not
rewrite imported evidence. Calendar dates are never shifted by
timezone normalization; only timestamp instants are serialized as UTC.

### 3.1 Lossless completion dates

The original `finished_date = NULL` plus `finished_precision = 'month'` lost
the actual month. Use inclusive bounds and retain the raw text:

| Source value        | From       | To         | Precision |
| ------------------- | ---------- | ---------- | --------- |
| `2026` (year only)  | 2026-01-01 | 2026-12-31 | year      |
| `2026-05`           | 2026-05-01 | 2026-05-31 | month     |
| `2026-03-23`        | 2026-03-23 | 2026-03-23 | day       |
| `2026-07~08`        | 2026-07-01 | 2026-08-31 | range     |
| `2026-03-05~06`     | 2026-03-05 | 2026-03-06 | range     |
| Empty or unresolved | NULL       | NULL       | unknown   |

Bounds describe uncertainty; they must not be displayed as a claimed exact
finish date. Row checks require: unknown has two NULL bounds; day has equal
bounds; month is exactly one complete calendar month; year is exactly one
complete calendar year; range has ordered, distinct bounds. Finite dates only.

Parse `Finished Date` first. A valid `Year Finished` may supply a missing year
or must agree with parsed bounds; conflicts create a blocking field issue.
Recognize the six imprecise formats observed in the snapshot, including
`2026-04~05`, `2026-06`, and `2026-08-10~11`. Excel serial conversion must
respect the workbook's date system; neither a five-digit number nor `Aug 2026`
is accepted as a literal year. Record proposed conversions for review, retaining
raw values. Do not silently assert day precision from a corrupted year cell.

### 3.2 Attribution and derived values

`source_updated_by` is the last editor of a row, not the author of all its
fields. An AI relevance explanation can coexist with a user-edited title.
`book_field_provenance` stores the current attribution per `(book_id bigint FK,
field_name text)` (composite PK), with `origin text!` (`user`, `ai`, `external`,
`unknown`), optional `actor`, `provider`, `model`, `prompt_version`,
`source_reference`, `produced_at timestamptz`, `reviewed_by`,
`reviewed_at timestamptz`, `import_run_id uuid FK`, and required
`value_sha256` (64 lowercase hex characters). `field_name` is an allowlisted
qualified aggregate field such as `book_feedback.opinion` or
`book_assessments.relevance_reason`, not arbitrary SQL input. Unqualified metadata fields in this table
are text. Book deletion is RESTRICTed. The value hash is SHA-256 over UTF-8
canonical JSON containing the field name, type, and value, with a versioned
serializer; null and empty string must have different encodings.

Values and attribution update atomically; their hash must match the current
value. Imported unknown metadata stays unknown. Mark the documented relevance
fields as AI-derived without inventing their model, prompt, or generation time.
Other fields require evidence for attribution; the last row editor is insufficient.
This table records current attribution, not a fabricated historical audit log.
Raw import rows preserve historical source evidence.

Assessments store the latest imported/accepted bundle for compatibility, not
a fabricated timeline of past recommendations. The table has `review_state
text! CHECK (unreviewed,accepted,rejected)` DEFAULT `unreviewed`, plus optional
`reviewed_by text` / `reviewed_at timestamptz`. Accepted or rejected bundles
require both reviewer fields; a replacement resets them. Generation success
does not mean user acceptance. Before introducing a live generator, require
versioned runs with input revision/hash and a separate proposal-to-acceptance
workflow; an enrichment worker may not replace an accepted bundle or edit
`book_feedback` directly. No background recomputation is part of importing
the existing assessment values.

Import-owned derived representations (paragraphs, parsed sources, lookup links)
are rebuilt from retained source values atomically. `Read?` is derived from
status and is not another editable truth. Runtime actors and versions are
set by trusted server operations, never taken from anonymous client claims.

### 3.3 Complete main-sheet mapping

Every original cell is additionally retained in `import_rows`. The mapping
below covers the 35 headers of the pinned export; it is not a positional
assumption about future exports.

| Source header        | Normalized destination or rule                                              |
| -------------------- | --------------------------------------------------------------------------- |
| Title                | `books.title`; stringify synthetic numeric `2048` without altering identity |
| Author               | Reviewed `authors` / `author_aliases` and ordered `book_authors`            |
| Series               | `books.series_id`, `books.series_label_raw`, and `series`                   |
| Platform             | `books.platform`                                                            |
| Status               | `books.status`                                                              |
| Read?                | Evidence only; derive display from status and report disagreement           |
| Liked                | `book_feedback.rating`; parse stars without deriving an opinion             |
| Year Finished        | `books.finished_year_raw` and reviewed completion bounds                    |
| Opinion              | `book_feedback.opinion_raw`, `book_feedback.opinion`                        |
| Notes                | `book_feedback.notes`                                                       |
| Cover URL            | `books.cover_url` or private field quarantine                               |
| Next Rank            | `books.next_rank`                                                           |
| Why Next             | `books.why_next`                                                            |
| Pros                 | `book_assessments.pros`                                                     |
| Cons                 | `book_assessments.cons`                                                     |
| Next Slot            | `books.next_slot`                                                           |
| Community Rating     | `books.community_rating`                                                    |
| Ratings Count        | `books.ratings_count`                                                       |
| Rating Source        | `books.rating_source`                                                       |
| Rating Updated       | `books.rating_updated`                                                      |
| Personal Relevance   | `book_assessments.personal_relevance` and field attribution                 |
| Relevance Reason     | `book_assessments.relevance_reason` and field attribution                   |
| Relevance Updated    | `book_assessments.relevance_updated`; not a fabricated provider timestamp   |
| Book ID              | `books.stable_id`, exact preserved join key                                 |
| Updated At           | `books.source_updated_at`                                                   |
| Updated By           | `books.source_updated_by`                                                   |
| Series Volume        | `books.series_volume`                                                       |
| Series Published     | Reconciled `series.published_count`; sentinel metadata retained in evidence |
| Series Planned Total | Reconciled `series.planned_count`                                           |
| Series Status        | Reconciled `series.status`                                                  |
| Series Checked       | Reconciled `series.checked_at`                                              |
| Genre                | `genres` and `book_genres`; eight blanks produce zero links                 |
| Finished Date        | `books.finished_date_raw`, bounds, and precision                            |
| Added At             | `books.added_at`; distinct from DB creation time                            |
| Word Count           | `books.word_count`; register the 35-column import contract explicitly       |

## 4. Other tables (columns + constraints)

- **book_feedback** — `book_id bigint PK/FK → books`, fields specified in §3, lifecycle and source audit below, `row_version bigint! > 0 DEFAULT 1`. The owner edits through a version-checked operation. The child may be absent; no numeric rating is inferred from prose or emoji.
- **book_assessments** — `book_id bigint PK/FK → books`, fields specified in §3/§3.2, lifecycle and source audit below, `row_version bigint! > 0 DEFAULT 1`. Imported origin is established per field; storage here does not assert that every cell was generated by AI. Accept/reject and source replacement are distinct operations.
- **authors** — `id`, `name text!`, `name_key text! UNIQUE`. The key is a versioned, conservative normalization (trim, Unicode NFC, case folding); do not remove accents or automatically merge initials. Same-name distinct people require an explicit disambiguated key.
- **author_aliases** — `alias_key text PK`, `alias text!`, `author_id bigint! FK`, `resolution_note text!`. Resolve individual names, not a combined coauthor string. Seed reviewed variants during import rather than promising an empty table. Ambiguity blocks the affected reference.
- **series** — `id`, `name text!`, `name_key text! UNIQUE`, `published_count integer >= 0`, `planned_count integer >= 0`, `status text CHECK (Complete,Ongoing,No sequence,Unknown)`, `checked_at date`. Conflicting counts/statuses require review; never use an arbitrary maximum. Matching attributes with different checked dates use the latest date with source lineage; two such groups occur in this snapshot.
- **genres** — `id`, `name text!`, `name_key text! UNIQUE`; retain vocabulary and reviewed alias mapping. Do not infer a genre from a series sentinel.
- **book_authors** — PK(`book_id`,`author_id`), both bigint FKs; `position integer! > 0`; UNIQUE(`book_id`,`position`). Every accepted book has at least one author, checked at transaction completion. Unknown/unresolved author data stays in staging.
- **book_genres** — PK(`book_id`,`genre_id`), both bigint FKs. Zero genres is valid.
- **quotes** — `id`, `book_id bigint! FK`, `text text!`, `attribution text`, `position integer! > 0`, UNIQUE(`book_id`,`position`). Attribution may name a character. Keep occurrence order; duplicate text is not automatically a duplicate record.
- **recaps** — PK/FK `book_id bigint`, `status text! CHECK (verified,summary,pending,deferred)`, `verified_at date`, `edition text`, `quick_refresher text`, `characters text`, `cheat_sheet text`, `full_story text`, `series_handoff text`, `reason text`, `sources_raw text`, `paragraph_sources_raw text`, `validation_state text! CHECK (valid,needs_review)` DEFAULT `needs_review`, `validation_rule_version text`, `validated_at timestamptz`. Source status and structural validity are distinct (§4.1).
- **recap_sources** — `id`, `book_id bigint! FK → recaps`, `position integer! > 0`, `title text!`, `url text!` valid HTTP(S), UNIQUE(`book_id`,`position`), UNIQUE(`book_id`,`id`).
- **recap_paragraphs** — `id`, `book_id bigint! FK → recaps`, `position integer! > 0`, `body text!`, UNIQUE(`book_id`,`position`), UNIQUE(`book_id`,`id`). Split full story on blank lines, preserving paragraph text and order; a single newline is not a paragraph boundary.
- **recap_paragraph_sources** — `book_id bigint!`, `paragraph_id bigint!`, `source_id bigint!`, PK(`paragraph_id`,`source_id`). Composite FKs (`book_id`,`paragraph_id`) → paragraphs (`book_id`,`id`) and (`book_id`,`source_id`) → sources (`book_id`,`id`) prevent cross-book attribution.
- **author_highlights** — `id`, `author_id bigint! FK`, `rank integer! > 0`, `title text!`, `first_published integer`, `cover_url text`, `source_url text`, `source text`, UNIQUE(`author_id`,`rank`). First publication is a work-level year; 1–4 is an observed rank range, not a permanent cap. Raw rows retain the unused `Series` column.
- **series_catalog** — `id`, `series_id bigint! FK`, `volume numeric!` finite and > 0, `title text!`, `author_id bigint FK`, `source_url text`, UNIQUE(`series_id`,`volume`). This v1 reference feed has one author per entry; preserve raw author text and quarantine unresolved or multi-author references rather than dropping a collaborator. A future catalog-author junction can extend this without changing personal Book IDs.
- **comparison_events** — specified fully in §4.2.
- **book_rankings / ranking_state** — specified fully in §4.3.

Mutable entity/enrichment tables in this section (feedback, assessments,
authors, series, genres, quotes, recaps, highlights, catalog) carry `created_at timestamptz! DEFAULT
now()`, `updated_at timestamptz! DEFAULT now()`, `updated_by text!` with no
default, optional `source_updated_at timestamptz`, `source_updated_by text`,
and `last_import_run_id uuid FK`. Import audit references use RESTRICT.
Derived recap children inherit attribution through their parent. Every
unlisted default is absent; missing domain values must not be fabricated.
For imported feedback/assessments, copying the parent Sheet audit describes
the same source row only; per-field attribution remains independent. Child
updates use their own `row_version`; an unrelated AI assessment must not cause
a feedback edit to conflict. Multi-table owner edits are one transaction.
Unless explicitly changed by the deletion policy in §9, every FK uses
ON UPDATE RESTRICT / ON DELETE RESTRICT. Referenced IDs are immutable.
For accepted books, a deferred constraint trigger checks author existence
after inserts/deletions of author links and inserts of books; the trusted
writer locks the parent before changing its links. New or edited URLs use a
shared HTTP(S) parser in trusted writes, with a DB scheme check as defense in
depth. No SQL regex is claimed to validate a complete URL.

### 4.1 Recap integrity and publication

Preserve the prototype's `src/recap-catalog.mjs` semantics: named lines,
source labels, one-based source indices in the Sheet, and paragraphs separated
by blank lines. Keep DB positions one-based. The earlier single-newline split
was underspecified. Full-story text is canonical; paragraph rows are its
rebuildable representation, not an independently editable second copy.

For `verified` and `summary`, run the existing structural validator (or a
versioned equivalent) before setting `validation_state = 'valid'`. It requires
verification date, refresher, prose, sources, and resolvable provenance for
every paragraph; verified recaps additionally require figure guide and cheat
sheet. Preserve its word-count and summary restrictions. Structural validation
does not establish factual accuracy or authorize generating a new recap.
`pending` and `deferred` need a reason and do not publish prose.

The 2026-09-20 live observation found five rows with `RECAP_REFERENCE_NONNUMERIC`, beyond the three historical count mismatches. Validate every row; counts are dated observations, never acceptance invariants.

For any recap with invalid provenance, retain source status, all raw prose,
and provenance text, but set `validation_state = 'needs_review'`. Do not invent
paragraph-source links by positional guesswork or publish those recaps as
validated. Parse valid sources/paragraphs; withhold disputed links for the
affected recap until an explicit mapping is reviewed. Acceptance counts must
distinguish source rows, normalized rows, trusted links, and quarantined links.

Publication requires an active `read` book, an allowed source status, and
`validation_state = 'valid'`. Any change to prose/sources invalidates structural
validation in the same transaction. A trusted write routine rebuilds children,
runs validation, and records the rule version; direct runtime writes to the
derived children are denied. Recap content can be retained if reading status
later changes, but it leaves the eligible publication view.

### 4.2 Comparison events: identity, integrity, and concurrent writes

| Column                       | Type / rule                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `event_id`                   | uuid PK, supplied and preserved on import                                        |
| `event_seq`                  | bigint identity UNIQUE!, ingestion order; never replaces original timestamps     |
| `client_request_id`          | uuid! UNIQUE, no default                                                         |
| `event_type`                 | text! CHECK (`Decision`,`Void`)                                                  |
| `pair_key`                   | text, canonical sorted **stable IDs**, joined with `::`; non-unique              |
| `book_a_id`, `book_b_id`     | bigint FKs → books, RESTRICT; presentation order                                 |
| `outcome`                    | text CHECK (`A`,`B`,`Tie`); refers to presentation order                         |
| `compared_at`                | timestamptz!, preserve source; new writes use server time                        |
| `session_id`                 | uuid; required for new decisions; missing legacy values retained with diagnostic |
| `target_event_id`            | uuid FK → events, RESTRICT                                                       |
| `actor`, `algorithm_version` | text!, nonblank; no defaults; PRIVATE                                            |
| `import_run_id`              | uuid FK, nullable for native events                                              |
| `created_at`                 | timestamptz! DEFAULT now(), ingestion time                                       |

Enforcement is explicit:

1. A row CHECK requires every Decision to have pair, A, B, outcome, distinct
   book IDs, and no target. Every Void has a target and NULL pair/A/B/outcome.
   `target_event_id <> event_id`. Use explicit NULL predicates in both branches.
2. FKs establish book/target existence. An insert trigger requires a Void's
   target to be a Decision already ingested (`target.event_seq < event_seq`).
   A partial UNIQUE index on non-NULL `target_event_id` permits at most one Void
   per Decision and arbitrates concurrent attempts.
3. An insert trigger derives/validates pair identity from referenced immutable
   stable IDs, never from numeric surrogate order. Import IDs currently use
   ASCII UUIDs/slugs; DB `COLLATE "C"` sorting must match the prototype's
   JavaScript `sort()` for this supported ID alphabet. Future non-ASCII IDs
   require an explicit encoding/sorting revision. The source pair is retained
   in raw evidence; a mismatch blocks the event import.
4. The authenticated write operation locks the two books in increasing numeric
   ID order and requires active `status = 'read'`. Status updates acquire the
   same book locks. Historical import checks the supplied snapshot rather than
   asserting what the status was at the original event time.
5. Duplicate request IDs return the existing event only when the complete
   semantic payload agrees (type, ordered A/B, outcome, target, session, actor,
   algorithm). A reversed presentation with the same `A` outcome is not the
   same vote. Conflicting payloads are rejected; UUID uniqueness alone is not
   sufficient. Client-supplied retry payload excludes server-assigned times.
   Resolve a retry before current eligibility checks so a previously accepted
   request stays idempotent after a book's status changes. The unique index
   arbitrates races; after a conflict, re-read and compare the winning payload.
6. Preserve the prototype's replacement operation: a new decision for an
   already-active pair appends a Void for the active decision and the new
   Decision in one transaction. Serialize competing writes for the pair
   (ordered book locks suffice at this scale). Undo appends a Void. Import
   replays the original history without inserting inferred replacement events.
7. Runtime roles receive EXECUTE on narrow append/undo routines, not UPDATE,
   DELETE, TRUNCATE, or unrestricted INSERT on events. Triggers additionally
   reject UPDATE/DELETE/TRUNCATE. The owner/migration role remains privileged
   and must not be a runtime credential.

Effective decisions are all Decision events whose IDs have no Void targeting
them. Do not silently collapse repeated pair keys or reverse A/B before
resolving the outcome. The snapshot has 606 decisions, eight distinct voided
decisions, hence 598 effective events; 599 distinct historical pair keys is
a different measurement. Import decisions before their voids, preserving
all source IDs, timestamps, actors, outcomes, and payloads.
Within each event type, ingest in original Sheet row order, recording that
order in raw evidence. For runtime creation, obtain event sequence values
inside the serialized write operation. Identity sequence values are not a
general substitute for commit order or source event chronology.

### 4.3 Rankings as an atomic, replaceable cache

`book_rankings`: `book_id bigint PK/FK`, `rank integer! UNIQUE > 0`,
`preference_strength double precision!` finite, `standard_error double
precision!` finite and >= 0, `effective_decisions integer! >= 0`,
`distinct_opponents integer! >= 0`, `provisional boolean!` with no default,
`calculated_at timestamptz!`, `algorithm_version text!`, `data_revision text!`.
Reuse the prototype's Bradley–Terry behavior and explicit tie-break rules.

`ranking_state` has one row (`id smallint PK CHECK (id = 1)`),
`state text! CHECK (stale,ready)` DEFAULT `stale`,
`input_version bigint! >= 0` DEFAULT 0, `computed_input_version bigint`,
`data_revision text`, `book_inputs_revision text`, `algorithm_version text`,
`calculated_at timestamptz`. Hashes are 64 lowercase hex characters. Computed
metadata is NULL until the first complete rebuild. This row represents an
empty ranking set and invalidation, which per-book cache rows alone cannot do.

`data_revision` preserves the prototype's effective-event hash, computed with
original stable Book IDs, never surrogate IDs. `book_inputs_revision` hashes
the sorted eligible `(stable_id, title)` records with a versioned serializer.
The current ranking engine uses title as its first tie-breaker; a title edit
can change ordering even with identical votes and eligibility. Status/archival
changes can change the input set without changing events. Pin the tie-break
locale and algorithm parameters in the algorithm version and its test fixtures;
do not rely on an unspecified server locale. Changes to those settings also
invalidate the cache. Never reuse the event hash as proof of all input freshness.

Event/eligibility/title writers first lock `ranking_state`, then affected books,
then event targets, and increment `input_version` and mark stale in the same
transaction. A rebuild captures one consistent input snapshot and its version,
calculates outside the write transaction, then locks `ranking_state` and
publishes only if the input version still agrees. Replace the cache and mark
ready atomically, set `computed_input_version = input_version`, and write
identical algorithm/revision/timestamp metadata on every cache row. Ready
requires populated metadata and matching versions; stale may retain the last
completed revision. A mismatch discards the candidate and retries. Readers must
see either a complete ready revision or an explicitly stale result, never
half of each. Import ranking rows are retained as a reference, not installed
as current truth; compare the rebuilt result against that reference with
documented numeric tolerances and investigate differences.

## 5. Relationships (exact multiplicities)

| Relationship                                   | Cardinality                       | Evidence                                                                     |
| ---------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `books` ↔ `authors`                            | N:M; accepted book has ≥ 1 author | 174 books, 176 `book_authors`; 2 co-authored                                 |
| `books` → `genres`                             | N:M                               | 177 `book_genres`; 11 books have 2                                           |
| `books` → `quotes`                             | 1:0..N                            | 0–7 observed, not a constraint                                               |
| `books` → `book_feedback` / `book_assessments` | Independently 1:0..1              | Separate owner content from inferred evaluations                             |
| `books` → `recaps`                             | 1:0..1                            | 79 recaps in the pinned export; future gaps are allowed                      |
| `recaps` → `sources`                           | 1:0..N                            | 239 source lines; pending/deferred may have none                             |
| `recaps` → `paragraphs`                        | 1:0..N                            | 397 paragraphs; none required for pending/deferred                           |
| `paragraphs` → `sources`                       | N:M                               | 864 candidate references; accepted links must be reconciled after quarantine |
| `authors` → `highlights`                       | 1:0..N                            | 1–4 observed for 85 source author names; others have none                    |
| `series` → `catalog`                           | 1:0..N                            | 87 rows for 21 series; other series may have no catalog                      |
| `books` → `comparison_events`                  | Two separate 1:0..N FKs for A/B   | Every Decision has exactly two distinct books; Void has none                 |
| `comparison_events` → `comparison_events`      | Decision 1:0..1 Void              | Each Void targets exactly one Decision                                       |
| `books` → `rankings`                           | 1:0..1                            | 79 = `read` books                                                            |

## 6. Key structural decisions (why the shape is what it is)

- **D1 Surrogate + stable id.** `Book ID` is 162 UUID + 12 slugs; a `uuid` PK would need invented ids. `bigint` surrogate + `stable_id text UNIQUE` keeps the live join key and small FKs.
- **D2 Event vs state.** `comparison_events` is append-only with `client_request_id UNIQUE`; `pair_key` is deliberately non-unique (4 rematches, one ×5). Voids reference a target and carry no pair/outcome (enforced by `decision_has_pair`).
- **D3 Presentation vs canonical pair.** `book_a_id`/`book_b_id` are the _left/right presentation_; `pair_key` is the _canonical sorted identity_. Verified: `pair_key == sorted(A,B)` on all 606 decisions, while 283/606 were presented in reversed order. `outcome` (`A`/`B`) refers to the presentation side. Do NOT merge these two notions.
- **D4 Co-authorship.** Exactly 2 books split on `&`; `book_authors.position` preserves order. Resolve aliases per person with reviewed mappings; never map a two-person string to one author.
- **D5 Multi-genre.** 11 books carry two `; `-joined genres; `book_genres` is the junction. `genres` lookup enables rename/i18n later.
- **D6 Sentinel series.** The four sentinels (68 rows) map to `series_id NULL` and retain the original `series_label_raw`; none carries a volume. Preserve the distinction without enshrining mixed genre/form/series vocabulary as a new enum.
- **D7 Temporal precision.** Bounds + precision + raw cells preserve months/ranges (§3.1). Exact dates and year are derived for consumers; they are not independent writable truths.
- **D8 Rating parsed, opinion verbatim.** `book_feedback.rating` comes from `4⭐`/`4.5⭐`; `opinion_raw` preserves the cell, including the 14 `🧹` sentinels. Evaluative pros/cons and relevance live in `book_assessments` and are not promoted to user sentiment.
- **D9 Eligibility over time.** Equality of four 79-book sets is an export observation. New finished books may have no recap or comparisons. New decisions require read status; historical decisions/recaps survive corrections or rereading. Active publication/ranking views filter current eligibility and invalidate caches when it changes.
- **D10 Provenance.** Keep imported audit, runtime writer, and field attribution separate (§3.2); row-level last editor cannot establish authorship of every value.

## 7. Indexes and query boundaries

| Index                                                                   | Serves                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unique keys and primary keys                                            | Identity, upsert resolution, ordered recap children, ranking order; do not duplicate their indexes |
| `books(series_id)`; `author_aliases(author_id)`                         | Series lookup, alias reconciliation, FK checks                                                     |
| `comparison_events(pair_key)` (non-NULL partial)                        | Pair history and replacement operation                                                             |
| `comparison_events(book_a_id)` and `(book_b_id)`                        | Each participant's history; a composite index does not replace B-only access                       |
| Unique `comparison_events(target_event_id)` (non-NULL partial)          | Single void per decision and effective-event anti-join                                             |
| `book_authors_author_idx`, `book_genres_genre_idx`                      | author/genre fan-out                                                                               |
| `recap_paragraph_sources(book_id, source_id)`                           | Reverse provenance/FK lookup; paragraph-first PK already covers paragraph access                   |
| Import-run FK indexes on imported entities; `series_catalog(author_id)` | Reconciliation and reference checks                                                                |
| Optional public title-only GIN/trigram indexes                          | Introduced with measured public search requirements                                                |
| Optional private text and vector indexes                                | Introduced only with authenticated retrieval (§10)                                                 |

Foreign keys do not automatically create referencing-side indexes. Keep this
small workload simple: PK/unique and concrete relationship access first, then
use representative queries and EXPLAIN to justify search/status/date indexes.
Do not claim latency numbers without measurements. PostgreSQL full-text search
is not automatically BM25. A public search query must never filter or rank on
private notes, even if the response omits those columns.

## 8. Edge cases the structure absorbs

- Legacy slug `Book ID` → `stable_id text`.
- 2 corrupted `Cover URL` cells in the pinned export → NULL plus private raw preservation and a field issue. The companion note reports an origin fix; verify a fresh export before treating it as resolved. Never log the misplaced personal prose publicly or fetch malformed URLs.
- Excel serial dates → explicit conversion proposal using workbook date-system metadata; keep raw evidence and review ambiguity.
- Month/range completion → inclusive bounds + precision + raw cells, with no lost month or invented exact date.
- Historical export: 3 recaps with mismatched provenance (`RECAP_REFERENCE_COUNT_MISMATCH`) → preserve source content, flag `needs_review`, withhold disputed edges and publication; no guessed attribution.
- `Word Count` (undocumented 35th column) → imported, flagged unofficial.
- `🧹` opinion sentinel → preserved in `opinion_raw`; no forced semantics.

## 9. Privacy, ownership, and deletion

Every base table is private by default. Recommended database namespaces are
`library` (domain), `import_audit` (raw rows/issues), and `api_public` (explicit
read-only views). These names are part of the proposed migration, not claims
about current Neon configuration.

| Role                     | Intended grants                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Migration owner          | Schema/role management; never used by runtime requests                                                  |
| Importer                 | Stage evidence and execute validated import transaction; cannot publish or generate AI output           |
| Public reader            | SELECT only on approved public views; no base tables, audit, private search, or writer routines         |
| Private reader           | Explicit read grants to owner-facing data; API must authenticate the owner before using this credential |
| Editor                   | EXECUTE on authorized book/recap/event operations; no unrestricted base-table DML                       |
| Ranking worker           | Read eligible inputs and execute atomic cache publication; no personal-data edits                       |
| Future enrichment worker | Only approved enrichment operations; no ownership/status/opinion writes                                 |

These are permission groups, not a requirement to provision seven login users
before the first import. Create only the roles/routines required by the current
delivery slice; keep migration, import, and runtime privileges separate.
Feedback and assessment base tables have no public grants. A future assessment
worker cannot update `books` or `book_feedback`; the owner alone approves
promoting proposed analysis into accepted assessments.

Revoke PUBLIC access to application schemas, tables, and custom routines;
configure default privileges for the actual object-creating role. Grant only
required sequences and function execution. Any SECURITY DEFINER routine uses
a fixed safe search_path, schema-qualified objects, and an owner with only
the privileges it needs. Connection credentials remain server-side; a public
and private request must not accidentally share a broad privileged reader.
There is no browser-to-Postgres access.

For the initial public library view, allow only `stable_id`, `title`, ordered
author names, series display metadata, genres, `platform`, `status`, validated
`cover_url`, and `word_count`, for active books. Additional fields need an
explicit publication contract. Published recaps expose only validated content
and approved source metadata; public rankings expose `stable_id`, `rank`, and
freshness metadata. No `SELECT *` in a public view or serializer.

Always private: notes, opinion/raw opinion, pros/cons, next-read internals,
personal relevance/reasons, all comparison rows, detailed ranking strength/
uncertainty, actors, import cells/issues, raw timestamps/IDs used for audit,
and derived private search terms/vectors. New columns do not become public
automatically. Do not put private data in fallback JSON, logs, errors, source
maps, or public caches. Authentication gates are required before any private
API is enabled; choosing an auth provider is outside this schema decision.

V1 is one-owner, so schema/view privileges and server authentication define
the boundary. RLS is not claimed as implemented. A future multi-user feature
must introduce ownership keys, cross-owner FK protection, and tested RLS
before serving another user's rows.

Hard deletion of books, authors, genres, series, events, and import evidence
is denied to runtime roles and RESTRICTed by incoming FKs. Archive books via
`archived_at`; exclude archived books from active views and invalidate rankings.
Deleting a lookup never silently removes authorship or classification.
Only derived recap children may CASCADE from their recap parent, and
paragraph-source links may CASCADE from their paragraph/source parent.
Replacement occurs inside one trusted transaction. Permanent erasure/retention
of personal data requires a separately reviewed workflow, including backups.

## 10. Optional search and embeddings

Keep the recorded OpenAI `text-embedding-3-small` / 1536 choice available for
the semantic-search slice. The base relational migration has no provider
dependency. An optional migration can add nullable `vector(1536)` columns on
the feedback/assessment/quote/recap/paragraph fields, with backfill
disabled until its separately authorized feature is ready.

Before activation, use a fixed PT/EN query set covering exact titles, aliases,
paraphrases, spoilers, and private/public filtering. Compare lexical search,
exact vector search, and their combination for useful top-k results, latency,
and estimated regeneration cost. The current existence of `ChatGPT` in a
source audit column is not evidence that this embedding model is appropriate.
Keep the recorded choice if it meets those checks; change it if measurements
justify the change. No paid model call is required to implement the base schema.

Before storing any vector, record field-level model/provider, dimension,
input-content SHA-256, preprocessing/chunking version, generated timestamp,
and job identity. A vector and this metadata form one atomic result. Changing
source content makes the vector stale immediately; exclude it from retrieval
until regenerated. Keep private text and derived vectors under identical
access rules. A row's `updated_by` is insufficient embedding lineage.

Benchmark exact vector search first at this corpus size. Add HNSW only if
measured latency/recall warrants it. Adding indexes to every empty vector
column is not an acceptance condition. Do not mix vectors from different
models in one search space, even when dimensions match. A new model or
dimension requires re-embedding source content into a new versioned space;
casting old vectors does not produce valid embeddings for the new model.

Keyword search, if added, uses separate public and private inputs. A public
title/author/series search cannot use the prototype's combined vector of
title, notes, opinion, and relevance. Public retrieval must not reveal private
term matches through result membership, score, snippets, or ordering.

## 11. Import, reconciliation, and cutover

### 11.1 Private evidence and reproducibility

- `import_runs`: `id uuid PK`, `source_sha256 text!`, `transform_version text!`,
  `source_label text!`, `status text!` (`staged`,`applied`,`failed`),
  `started_at timestamptz! DEFAULT now()`, `completed_at timestamptz`,
  `manifest jsonb!`, `source_key text!`, `scope text!`, `effective_at timestamptz!`,
  `config_sha256 text!`, UNIQUE(`source_key`,`source_sha256`,`transform_version`,`scope`,`config_sha256`). Hash is
  validated as 64 lowercase hex; source labels never contain credentials.
- `import_rows`: PK(`run_id`,`sheet_name`,`row_number`), FK run RESTRICT,
  `row_number integer! > 0`, `cells jsonb!` (ordered original values/types and
  headers), `row_sha256 text!`, optional `stable_id text`. A row locator is
  evidence within one snapshot, never a book identity.
- `import_issues`: `id`, required FK to the composite import-row key,
  `field_name text!`, `code text!`, `severity text!` (`blocking`,`warning`),
  `resolution_state text!` (`open`,`accepted`,`resolved`), `resolution_note
text`, `resolved_by text`, `resolved_at timestamptz`. Required explanation,
  actor, and time accompany a disposition. Constraint failures are not waived
  by changing an issue's label.

Retain the original workbook privately with its checksum and date-system
metadata; it is the lossless evidence. The current profiling script trims cell
text, reads cached cell values, has an unconditional entrypoint, and its old
coverage summary checks `finished` rather than the actual `read` status. It is
an exploratory profiler, not a production lossless importer. The production
extractor must preserve cell types/values, normalize with explicit rules,
validate formula-cache assumptions, and use the actual status vocabulary.
Do not silently repair its source evidence or treat its old coverage summary
as an import acceptance test.

### 11.2 Deterministic import procedure

1. Pin an immutable export, checksum, exact headers, sheet names, extraction
   version, and transform/alias-map version. Verify source authority and export
   freshness. A new snapshot receives a new manifest, not reused counts.
2. Stage all seven sheets and persist private evidence before normalizing.
   Distinguish blocking identity/event errors from quarantined optional fields.
   Missing or duplicate Book IDs block the canonical import; never join by title
   or silently invent replacement IDs. Unexpected columns are retained and
   reported, not silently dropped.
3. Produce a dry-run mapping and issue report. Split only the documented author
   and genre delimiters; resolve aliases with a reviewed map. Preserve display
   order and reject empty/duplicate resolved author positions. Reconcile
   series metadata as specified in §4; the catalog does not create ownership.
4. Resolve books by immutable `stable_id`. Assign surrogate IDs once and use
   the resulting map for all children. Parse ratings/dates explicitly; retain
   all raw cells and sentinel distinctions. Reject integer overflow, non-finite
   numbers, out-of-range values, and invalid timestamps.
5. Normalize enrichment with parent identity verified. Stage malformed recaps
   intact, preserve source status in canonical recap rows where identity is
   valid, and mark their validation state as needs_review. Do not fabricate
   source edges. Keep candidate/accepted/quarantined counts separate.
6. Insert original Decisions, then Voids. For an existing event/request key,
   compare every source payload field, including source timestamp. Exact
   equality is a no-op; conflicting content aborts the run. Never UPDATE an
   event, infer an undo, or deduplicate legitimate rematches.
7. Apply accepted canonical rows, links, enrichment, and events in a single
   bounded transaction after validation. Acquire a global import lock; writers
   are disabled for this initial import. Mark the run applied atomically with
   the domain writes. On failure, roll back domain writes, then record failed
   state in a separate audit transaction; staged evidence remains available.
8. Rebuild rankings from accepted input with §4.3's publication guard. Do not
   invoke AI or embed anything. Validate identity coverage, raw preservation,
   orphan counts, date semantics, event payload equality, and permissions.
9. Re-run the same checksum/transform version: it must return the recorded
   outcome with zero duplicate domain rows/events and unchanged canonical
   values. Retry a failed run under the same lock using preserved staging.
   A changed transformer is a new run and must produce a reviewed delta.

`import_runs.status = 'applied'` means the accepted relational transaction
committed. It does not mean every optional field was repaired, rankings are
fresh, or the application has cut over. Expose those states separately using
issue dispositions, `ranking_state`, and the deployment/cutover record. A
failed ranking rebuild retries independently without reimporting canonical rows.

`books.stable_id` and original event UUIDs are durable upsert keys. Positions
for quotes/highlights/recap children are snapshot-local ordinals, not stable
identity across arbitrary future exports. A new snapshot requires a per-parent
delta/replacement plan that preserves native edits; never upsert reordered
quotes blindly by position. Within a repeated identical snapshot, its run
identity prevents duplicates. Do not delete absent books based on an export.
After cutover, imports must compare `row_version` and ownership of each field;
automatic Sheet synchronization is outside v1.

### 11.3 Cutover and recovery

First apply versioned migrations and imports to a disposable, isolated test
database. Record PostgreSQL version and required extension versions; the
older local test used PostgreSQL 16, but the live Neon version must be checked
before selecting the implementation's target image. Baseline DDL should not
require pgvector or pg_trgm. Migration history records names/checksums; a
second migration-runner invocation is a no-op, not a blind rerun of CREATE TABLE.

Before production import, take and verify a restorable backup and record a
tested restore procedure; do not assume a free hosting plan supplies a specific
retention window. Freeze Sheet writes for the final export, reconcile the
final manifest, then switch one approved read/write path at a time with a
named rollback boundary. Before new DB-only writes, rollback can switch back
to the unchanged Sheet. After DB-only writes, restore/switchback must first
preserve and reconcile those new records. Avoid dual writers and destructive
down migrations as a rollback strategy.

Schema implementation, initial import, API adoption, and source-of-truth
cutover are separate delivery slices. Connection health is already delivered;
none of those later states follows automatically from it.

## 12. Acceptance criteria for implementation

The implementation ticket must turn the following into executable checks.
They are requirements, not claims that this documentation edit executed SQL.

| Area                | Required evidence                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema lifecycle    | Empty test database migrates; second runner invocation is a no-op; restore reproduces validated state                                                                                      |
| Identity            | 174 unique stable IDs survive the pinned fixture; all 12 slugs retain exact spelling; missing/duplicate IDs fail; title changes retain identity                                            |
| Relations           | No orphan FKs; author ordering preserved; duplicate positions and cross-book source edges rejected; empty genres accepted                                                                  |
| Dates               | Day/month/year and all six imprecise snapshot values round-trip semantically; ambiguous year conversions are recorded; invalid bounds fail                                                 |
| Data preservation   | Original workbook checksum and all raw rows retained; 68 sentinel-series rows preserve original label without fake series; two malformed cover cells remain private evidence               |
| Recaps              | 79 source identities accounted for; 397 paragraphs/239 source lines reconcile; three mismatches remain needs_review with no guessed links or public prose                                  |
| Events              | 614 event payloads preserved, 606 Decisions/8 Voids; 598 effective decisions; non-unique pair history retained; reversed presentation preserves the winner                                 |
| Event rejection     | Same-book vote, wrong canonical pair, missing book, Void targeting Void/self/missing target, second Void, and UPDATE/DELETE/TRUNCATE denied                                                |
| Concurrency         | Concurrent identical retry yields one logical result; conflicting retry fails; pair replacement and undo are atomic; status-edit race cannot admit an ineligible new vote                  |
| Cache               | One coherent ranking revision; events, eligibility, tie-break title, or algorithm changes mark stale; stale rebuild cannot overwrite newer input; empty eligible set represented correctly |
| Import              | Same snapshot/version twice changes nothing; induced failure rolls back domain writes while preserving diagnostics; new snapshot cannot overwrite native edits silently                    |
| Attribution         | Last editor does not become field author; known AI values stay labeled AI; missing model/actor details remain unknown                                                                      |
| Aggregate ownership | Feedback and assessment have independent versions; assessment import/generation cannot overwrite personal feedback; new books need no assessment row                                       |
| Privacy             | Real role tests deny base-table/audit access to public reader; public responses and search do not expose private values or private-term matches; new columns remain private                |
| Cost and scope      | Base migration/import succeeds with no embedding API key, vector backfill, provider calls, or semantic-search indexes                                                                      |

Counts affected by alias review or quarantine need an explicit reconciliation
report; do not distort mappings to force the historical totals. The 332 author
highlight and 87 series-catalog source rows must all be accounted for as accepted
or specifically quarantined. Optional-field quarantine is visible and retains
raw data; it is not an unexplained dropped row.

### 12.1 Delivery slices and the next implementation ticket

The full target contract is intentionally broader than the next change.
Deliver it incrementally, with each slice reviewable on its own:

1. **Core schema, isolated validation.** Versioned migrations for import audit,
   authors/aliases, series, genres, books, feedback, assessments, field
   attribution, and author/genre links. Include data-preservation, date,
   optimistic-write, and role tests with small synthetic fixtures. Exclude
   live credentials, live import, AI calls, public APIs, event/ranking workers,
   and source-of-truth changes. This is the recommended next ticket.
2. **Dry-run importer and core reconciliation.** Pin a fresh authorized export,
   preserve all seven source sheets, normalize main-library data in an isolated
   database, and produce the ID/alias/field disposition report. Prove replay
   safety. Rows for later slices stay in staging rather than being discarded.
3. **Enrichment schema and import.** Quotes, recaps and exact provenance,
   author highlights, series catalog; report quarantined references and
   validate only records whose provenance is actually resolved.
4. **Comparisons and rankings.** Add immutable event history, concurrent
   append/undo behavior, and eligible-set-aware cache publication. Replay all
   events and reconcile ranking results. Activate invalidation in every
   relevant write path before enabling new votes.
5. **Application reads/writes and cutover.** Implement an owner CLI and opt-in public views under the addendum; private browser/API access requires a separately approved authentication design, verify against the imported data, test
   recovery, and switch canonical ownership with the agreed freeze boundary.
6. **Retrieval/AI feature.** Evaluate the retrieval workload, then add versioned
   vector storage, generation provenance, and optional indexes as warranted.

These are recommended slices, not six already-created tickets or authorization
to apply migrations. Do not require a public API, an auth provider, pgvector,
or a live data cutover to call the isolated core-schema ticket complete.

## 13. Required reconciliation with the SQL prototype

The historical private `schema/schema.sql` is not executable delivery input. Versioned migrations replace its implementation role and must satisfy:

- The `books` / `book_feedback` / `book_assessments` boundary and independently
  versioned writes with explicit assessment acceptance.
- Lossless completion bounds/raw values, retained series labels, and separate source/
  runtime audit fields; canonical optimistic versioning and field attribution.
- Reviewed individual-author aliases and canonicalization-sensitive counts.
- Ordered quote/author uniqueness and same-book composite recap source FKs.
- Recap raw provenance, validation state, and exact blank-line parsing.
- Complete event checks, pair validation, single-void rule, append-only
  enforcement, payload-aware retries, and transaction/locking routines.
- Atomic rankings with eligibility-aware invalidation and an empty-cache state.
- Explicit private namespaces, restricted roles, public view allowlists, and
  RESTRICT/CASCADE policies; replace the broad `b.*`/`r.*` convenience views.
- Private import manifests/staging/issues and the restart/reconciliation rules.
- Optional vector migration with metadata, disabled backfill, and measured
  index selection; remove claims that casting vectors changes their model.

The older design's source-fix, local SQL-test, and embedding decisions remain
historical evidence. This revision does not certify the old DDL or silently
rewrite the live Sheet. A migration PR must link this contract and report any
intentional deviation before application.

## 14. Sources and corrections

Local evidence: profile (private historical provenance, not an execution input),
raw profile output (private historical provenance, not an execution input),
profiler (private historical provenance, not an execution input),
integrity probe (private historical provenance, not an execution input),
and product thesis (private historical provenance, not an execution input).

Prototype contracts inspected on 2026-09-20 in the local `thiago-library`
repository: `docs/data-contracts.md`, `src/recap-catalog.mjs`,
`src/ranking-engine.mjs`, `src/ranking-scheduler.mjs`, and
`netlify/lib/ranking-core.mjs`. Implementers must pin the reused contract
version in their fixtures; a future checkout may change.

PostgreSQL's [constraints reference](https://www.postgresql.org/docs/current/ddl-constraints.html)
supports the distinction between row CHECKs, foreign keys, unique constraints,
and cross-row validation. Its [privileges reference](https://www.postgresql.org/docs/current/ddl-priv.html)
documents the grants required to make the privacy boundary enforceable.
The [pgvector documentation](https://github.com/pgvector/pgvector) distinguishes
exact and approximate vector search; HNSW is an optional performance choice.
Accessed 2026-09-20. The remaining product/import rules are design decisions
grounded in the local contracts and snapshot, not claims from those references.

Historical corrections retained from the preliminary analysis: multi-genre
rows are **11**, not four; `Added At` spans **2018–2026**, not 2019–2026.
This revision changes this document only, not the companion evidence files.

## 15. Change record

- 2026-09-19: structure spec created from the re-analysis; context-layer artifact.
- 2026-09-20: reconciled Neon delivery and recorded embedding choice; completed
  types, nullability, identity, temporal precision, series semantics, field
  attribution, recap provenance, event integrity, cache concurrency, privacy,
  deletion, import/recovery rules, and implementation acceptance criteria.
  Recounted the pinned workbook and corrected observation-vs-invariant claims.
  Challenged the preliminary architecture explicitly; separated personal
  feedback from inferred assessments; replaced a proposed mixed series-kind
  taxonomy with source-label preservation; reviewed the supplemental probes;
  and defined the next isolated implementation slice.
  Updated this design artifact only; application code, SQL prototype, live
  data, cloud configuration, credentials, and deployments were not changed.

- 2026-10-02: promoted sanitized requirements into the implementation repository; execution addendum governs scoped replay, freshness, field baselines, child collections, owner CLI and current validator findings. No application schema or importer delivered by promotion.
