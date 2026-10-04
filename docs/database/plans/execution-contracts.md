# Database Execution Contracts — 2026-09-20 Addendum

This is part of the execution pack, not a claim of implemented behavior. It supplements the older database structure document where the later user decisions are more specific. Other schema requirements remain unchanged.

## A. Authority and current data

Keep the Sheet unchanged. Normalize in a deterministic importer; preserve private original evidence. A source defect does not justify inventing data or blocking unrelated valid optional fields.

The 2026-09-20 live read found 174 unique, nonblank Book IDs, 35 main columns, 121 quotes, 79 recaps, 614 comparison events (606 Decisions, 8 valid Voids), and 79 ranking rows. No orphan book references were found. Two formerly invalid cover cells are corrected in the live Sheet. Four `Year Finished` cells render as month/year; six completion dates are intentionally imprecise. Five verified recap rows contain nonnumeric paragraph-reference prose (`RECAP_REFERENCE_NONNUMERIC`, count 5). The old export's three count mismatches are not a complete format-validation check. The new importer validates every row, never a hard-coded list of titles. Live counts are observations, not permanent constraints.

## B. Technical placement and database interfaces

| Path                                        | Responsibility                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `libs/domain/src/lib/database-contracts.ts` | Shared pure DTOs and literal enums, no Node/DB imports                          |
| `libs/database/`                            | Server-only SQL adapters, migrations, routines and PostgreSQL integration tests |
| `libs/importer/`                            | Server-only extraction, parsing, source merge, reconciliation and reports       |
| `tools/database/`                           | Thin CLI argument/env adapters and isolated DB lifecycle                        |
| `tests/fixtures/database/`                  | Synthetic input only, never copied real notes or recaps                         |
| `docs/database/`                            | Sanitized canonical contract, plans, runbooks and status after DB-00 promotion  |

Nx tags: `scope:database`, `scope:importer`. Allowed new edges: api → database/domain; database → domain; importer → database/domain. Existing web/data-access/ui edges remain unchanged; none can import database/importer. Browser calls only HTTP DTOs. Add TS aliases, project lint/typecheck/test targets and bundle scans, not a dependency-direction exception.

Use `pg@8.23.0` for offline operations, `@types/pg@8.23.1`, `tsx@4.23.15` for TS CLIs and `exceljs@4.4.0` for extraction; registry versions were read on 2026-09-20. Add exact versions during implementation, commit lockfile only after install succeeds. Retain the existing exact Neon driver from main. If a dependency has an unresolved relevant security advisory at execution, stop its installation and request a reviewed replacement, not a silent upgrade. No ORM is selected: SQL constraints/functions are the source of truth.

SQL baseline uses PostgreSQL 16-compatible features, with local tests on `postgres:16.15` and CI additionally on `postgres:18.6`. Before any hosted rehearsal inspect the actual Neon major and run the suite on that major; support is established by tests, not assumption. Record immutable image digests in execution evidence. Tool patch upgrades are reviewed maintenance, not schema changes.

Database namespaces: `library`, `import_audit`, `api_public`, plus `db_meta` for migrations/environment metadata. Permission groups: `library_owner`, `library_importer`, `library_editor`, `library_private_reader`, `library_public_reader`, `library_ranking_worker` (all NOLOGIN). Bootstrap grants the migration login membership in owner; runtime logins are separate and never owner members. Managed-role creation belongs to the hosted approval gate.

Environment variables, read only by explicit operation:

- `DB_TEST_ADMIN_URL`: loopback-only disposable test administrative URL.
- `DB_MIGRATION_URL`: direct owner-capable connection for migrations.
- `DB_IMPORT_URL`: direct importer connection.
- `DB_OWNER_URL`: direct private-reader/editor connection for local owner CLI.
- `DB_RANKING_URL`: direct ranking-worker connection.
- `DATABASE_URL`: existing pooled diagnostic URL; preserve health behavior.
- `DATABASE_PUBLIC_URL`: separately provisioned pooled public-reader URL for public API.

No fallback between credentials. No `VITE_` secret names. Never disable TLS verification for hosted connections. Import/migration/backup reject pooler hosts. Functions do not receive migration/import URLs. Local integration tests use distinct role connections, not an owner connection with mocked grants.

## C. Import representation

```ts
export type ImportScope = 'core' | 'enrichment' | 'events';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type CellEvidence = {
  column: number;
  header: string;
  address: string;
  type: string;
  value: Json;
  formula: string | null;
  cachedValue: Json;
  numberFormat: string | null;
};
export type SourceRow = { sheet: string; row: number; cells: CellEvidence[] };
export type SnapshotManifest = {
  version: 1;
  sourceKey: string;
  sourceSha256: string;
  rowsSha256: string;
  extractedAt: string;
  effectiveAt: string;
  freshnessApprovedBy: string;
  dateSystem: '1900' | '1904';
  extractorVersion: string;
  sheets: { name: string; headers: string[]; populatedRows: number }[];
};
export type Issue = {
  sheet: string;
  row: number;
  field: string;
  code: string;
  severity: 'blocking' | 'warning';
  disposition: 'open' | 'accepted' | 'resolved';
};
export type ImportReport = {
  runId: string | null;
  scope: ImportScope;
  sourceSha256: string;
  status: 'dry-run' | 'applied' | 'replayed' | 'failed';
  inserted: number;
  updated: number;
  unchanged: number;
  quarantined: number;
  conflicts: number;
  issues: Issue[];
};
```

Numbers count entities of the named scope; a separate `byEntity` report map carries detailed table counts. Quotes/links/paragraphs must not be conflated with books. `extractedAt` is not source freshness. `effectiveAt` and attestor record the approved export ordering; stale/unknown freshness blocks application, not extraction. A fresh capture from a live multi-tab read must either happen during a write freeze or be verified unchanged across two reads; a single connector pass is not atomic.

Each stage uses an immutable manifest, exact source bytes and a config digest. Extend `import_runs` with `source_key`, `scope`, `effective_at`, `config_sha256`; replace its old two-column unique key with `(source_key,source_sha256,transform_version,scope,config_sha256)`. This makes a later enrichment/event pass on the same export distinct from replaying the core pass. Config digest covers extractor, alias map, resolution manifest, target schema version and parser/merge policy versions; never secrets. Rows remain independently staged per run; no accidental loss from a prior `applied` core result.

Add `import_audit.source_heads(source_key text PRIMARY KEY, effective_at timestamptz NOT NULL, source_sha256 text NOT NULL)`. Core pass advances the accepted source head. Enrichment/events must use that head or explicitly approved replay of the same snapshot; an older export cannot silently regress source state. Different bytes with equal effective timestamp require review. No timestamps guessed from file modification time.

## D. Field merge: exact rules

Store `import_audit.field_baselines(source_key, entity_kind, entity_key, field_name, source_value jsonb, source_sha256, accepted_run_id)` with a composite PK on the first four columns. `source_value` is the last source value accepted or explicitly reconciled for that field, not simply the last observed row. Foreign-key the run; all source observations remain in import_rows. Track provenance with each canonical update. Do not use row-level Updated At as field authorship/freshness.

For existing entities let B = last accepted normalized source value, I = incoming valid normalized value, D = current DB value. Values are compared by versioned canonical JSON, not loose equality:

| Condition, evaluated in order                                       | Result                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Field missing from allowed optional source headers or quarantined   | Preserve D and baseline; emit the relevant diagnostic                 |
| Incoming blank                                                      | Preserve D and baseline; empty is not deletion                        |
| Explicit reviewed clear with matching expected current hash/version | Set NULL/empty collection as allowed; advance baseline and provenance |
| No baseline; D equals I                                             | Adopt baseline without a canonical update                             |
| No baseline; D is NULL and field accepts I                          | Fill D; adopt baseline                                                |
| No baseline; D differs and is non-NULL                              | Conflict; keep D/B; require a resolution manifest                     |
| I equals B                                                          | Source unchanged; preserve D, including native edits                  |
| I equals D                                                          | Already converged; advance baseline, no canonical version bump        |
| D equals B                                                          | Source-only change; write I and advance baseline                      |
| Otherwise                                                           | Both changed; preserve D/B, record conflict                           |

New book: validate required identity/title/author/platform/status first, then insert once. A source defect in required identity or event integrity blocks the whole scope transaction. Optional field parse failures/conflicts preserve that field and can coexist with accepted changes. Report `applied` plus nonzero issues honestly; never say every field migrated successfully.

`row_version` increments once per changed owning row per transaction, not once per field. No-op/replay must preserve canonical timestamps, IDs and versions. Baseline convergence may update audit metadata without a canonical write. Feedback/assessment versions are independent. Import cannot replace an accepted assessment or validated native recap automatically: treat it as an explicit conflict requiring an owner decision.

Merge atomic groups together: completion bounds+precision+raw cells; series+volume; ordered author links; genre set; each recap's prose+sources+derived links; community rating+count+source+date. Partial group replacement must not create incoherent combinations. Scalar raw evidence stays intact even when a group is quarantined.

Resolution manifest entries identify source hash, stable entity key, field/group, expected DB hash/version, action `use_source|keep_database|clear`, reviewer and review timestamp. Revalidate these expectations inside the application transaction. A changed DB requires new review. The manifest digest changes the run identity so reviewed conflicts can be retried without mutating an old applied run. A prior failed run with identical config may retry under the same lock.

Canonical serializer version `canonical-json-v1`: sort object keys by UTF-16 code-unit order; use JSON.stringify escaping, preserve array order, null vs empty string, exact string contents and finite numeric values; reject undefined/nonfinite numbers. NFC normalization is applied ONLY to lookup keys, not raw prose or preserved stable IDs. DB bigint IDs and decimal numeric values are transported as strings, preventing JS precision loss.

Use separate, explicitly named hash domains. Snapshot/config/merge hashes use canonical-json-v1 in TypeScript. Provenance hashes generated by trusted SQL use `pg-jsonb-text-v1`: `encode(sha256(convert_to(jsonb_build_object('field', qualified_field, 'type', logical_type, 'value', normalized_json_value)::text, 'UTF8')), 'hex')`. Add `hash_version text NOT NULL` to provenance. For verification, call this same DB function instead of assuming JS JSON.stringify and PostgreSQL jsonb::text are byte-identical. The DB function is schema-qualified, immutable, and covered by null/empty/Unicode/numeric-string fixtures; no pgcrypto extension is needed. Resolution manifests include hash_version and the DB-provided current-value hash/version. Operation-request hashes similarly use the SQL helper over an explicit normalized payload, not raw client key ordering.

## E. Lookup and collection ownership

Lookup key version `nfc-lower-v1`: `trim().normalize('NFC').toLowerCase()`, no accent removal or initial expansion. This explicitly replaces ambiguous full-Unicode case-fold wording for v1. Author splits use exact `&`; genres split on semicolon and trim tokens. Versioned reviewed alias map includes `N. Gaiman → Neil Gaiman` and `T. Pratchett → Terry Pratchett`; never infer other aliases. Conflicting series metadata is a field/reference issue, not max/last-row-wins.

Quotes have no stable source child ID. Add `origin` (`sheet|native`) and `source_key` to imported collection rows, with a CHECK requiring source_key only for sheet rows. Reconcile each parent's ordered sheet-owned collection as one group, with a baseline hash of its full ordered payload. If only source changed, atomically replace the sheet-owned segment; preserve native entries and give the resulting full list contiguous positions. If native edits changed the sheet-owned segment, conflict. Reordering affects order, not identity of a personal book. Identical quote text at different source positions is retained. There is no cross-export durable quote ID promise for source-owned entries.

Recaps are one parent aggregate: a source-only update replaces parsed children atomically; a native changed aggregate conflicts. Sources never link across books. Highlights reconcile per author, catalog per series using the same source-owned group rules. Removing a parent from a later export does not delete/archive the DB parent. Removing rows from a present parent's collection is a reported destructive delta requiring a reviewed group replacement, even when the collection becomes empty. Absence alone is not deletion authorization.

Recaps gain `owner_reviewed_by text` and `owner_reviewed_at timestamptz`, both NULL or both set by a trusted owner operation. Source verified_at/status never populates these fields. Replacing an owner-reviewed recap requires the explicit expected-version resolution; accepted replacement resets the owner-review marker. This makes the protection testable rather than inferring it from source status.

## F. Transactions and locks

One checked-out direct `pg` client for an entire migration/import/write transaction. Global migration lock is a session advisory lock on a direct connection, key `(73421,1)`. Import/application writers take transaction advisory lock `(73421,2)`: imports exclusive, normal writers shared. Then acquire ranking_state (once DB-04 exists), then books in increasing numeric ID order, then child/event locks. All writers follow this order; the normal shared gate does not serialize unrelated writes before ranking locks are needed.

Import dry-run executes inside a read-only repeatable-read transaction for current DB/baseline comparison; it does not stage into DB or advance heads. Import apply recomputes its decisions under the exclusive gate; dry-run is not permission to apply a stale plan. Staging is a prior committed audit transaction. Canonical rows, accepted baselines, provenance, scope completion and source head commit together. On failure rollback that transaction and record failure in a separate audit transaction. A failed audit write is a surfaced operational error, not success.

Default lock timeout 5 seconds, statement timeout 30 seconds; offline bulk import uses an explicit bounded 120-second statement timeout. Retry serialization/deadlock errors at most twice with bounded jitter; uniqueness/validation/conflict errors are not retried blindly. Never retry an unknown commit outcome by inventing new run/request identity.

## G. Privacy and implementation boundary

No account service is selected in this pack. Owner operations are a local CLI using a private DB login; no private HTTP endpoints are exposed. Optional public catalogue fields follow the existing spec allowlist and remain behind `PUBLIC_LIBRARY_ENABLED=false` until publication approval. This deliberately makes database delivery independent of choosing authentication; it does not claim authenticated browser workflows are delivered.

Source snapshot storage/report directories require owner-only permissions. Deny paths inside the tracked repository except synthetic fixtures; do not silently chmod or overwrite existing user files. Restrict error/log output to codes, counts and opaque run IDs; optional detailed files are private. Do not fetch covers/source links while importing.
