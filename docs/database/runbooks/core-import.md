# DB-02 core import runbook

State: implemented locally, pending independent merge-policy/permissions review.
Synthetic inputs only were authorized and used. This runbook does not authorize private
source access, real population, hosted connections or cutover. DB-03 remains gated.

Run from the isolated repository root with Node 24 and pnpm 10.19.0. `pnpm db:up`
provides a marked synthetic local environment; the importer needs migration 0005 and
a dedicated login with `library_importer` membership, never the owner/admin login.
Follow [local development](local-development.md) for bootstrap and distinct roles.
`DB_IMPORT_URL` is the only importer connection input. Loopback, database-name,
environment-marker and exact migration-history checks run before audit staging.
There is no inherited `DATABASE_URL` or provider fallback.

## Immutable extraction

Use an explicitly authorized XLSX export with observed freshness and an identified
attestor. All examples below are templates; choose actual approved values and replace
uppercase arguments. Do not put source files, policies or detailed reports in Git.

```text
pnpm db:extract --source-file /PRIVATE/SOURCE.xlsx --out /PRIVATE/NEW-SNAPSHOT --source-key SOURCE_KEY --effective-at UTC_ISO --freshness-approved-by ATTESTOR
```

The main tab must be exactly `Untitled`; the six other tabs and exact headers are in
`libs/importer/src/headers.ts`. Columns may reorder. Missing core identity headers,
duplicate headers, missing required tabs or duplicate/invalid Book IDs freeze core writes.
Optional missing columns and unknown columns/tabs stay visible as diagnostics/evidence.

Extraction preserves source bytes and SHA-256, typed cell evidence, formulas/caches,
rich text, number formats, blank cells, coordinates and workbook date-system flag.
Original bytes are the ultimate lossless record. Numeric XML serials are retained for
typed dates; unavailable serial evidence and the fictional 1900 leap day are quarantined.
No formulas/macros execute and no URLs or external links are fetched. The bounded ZIP
reader accepts ordinary XLSX archives, rejects ZIP64/unsupported compression/traversal,
and limits inflated entries to 128 MiB total and 64 MiB each. XML serial lookup supports
standard Excel worksheet paths; missing evidence never becomes a guessed date.

Limits: source 25 MiB; 100 columns; 10,000 populated rows per sheet; 1,000,000 characters
per cell. Conservative layout checks also reject any merged cells and worksheet row
extents beyond 10,001. Unsupported layouts require later review.

`source.xlsx`, `manifest.json`, `rows.jsonl` and `extraction-report.json` use mode 0600
in a new directory of mode 0700 outside the repository. Symlinked/world-readable
snapshot files are refused. Re-extraction into an existing identical verified snapshot
returns its manifest; differing source/freshness/identity cannot overwrite it.
Importer verification recomputes both source and row hashes and validates exact schemas.

## Dry-run and application

```text
pnpm db:import --snapshot /PRIVATE/SNAPSHOT --scope core --dry-run --report /PRIVATE/NEW-DRY-REPORT
pnpm db:import --snapshot /PRIVATE/SNAPSHOT --scope core --apply --report /PRIVATE/NEW-APPLY-REPORT
pnpm db:verify --scope core --run-id RETURNED_UUID
```

Set `DB_IMPORT_URL` through the local environment; never print or commit its credentials.
Each report directory must be new. Detailed `report.json` and `dispositions.json` stay
private; the console prints only safe counts, status and run ID. Verification prints
counts and a canonical digest, not source prose or connection details.

Exactly one import mode is required. Dry-run uses a read-only repeatable-read transaction,
stages nothing and mutates no database rows. Apply stages every tab and normalized issues
in a committed audit transaction, then recomputes the plan under the exclusive import gate
on one checked-out client. Canonical rows, actual owning-row version increments, provenance,
accepted baselines, source head and original run result commit together. Failure rolls back
that entire scope and records a separate failed audit with SQLSTATE only. A failure to
write that audit propagates; it cannot masquerade as successful application.

The replay key includes source key, source hash, transform version, scope and complete
configuration digest (schema checksums, aliases, parser/merge versions, reviewed policies
and resolutions). Exact applied replay returns the original stored report, even after native
edits; original inserted/updated counts describe that first application. It performs no
restoration or version churn. Concurrent replay uses the same committed outcome. A changed
resolution or policy gets a new run; old run results remain historical evidence.

Newer effective source time is required for different bytes under the same source key;
older exports or equal-time/different-byte exports block. Source Updated At/By are metadata,
not native authorship, and do not gate field changes. Disappearance never implies deletion.
Blank/absent/invalid cells preserve destination fields. Ordered authors, genres, series,
completion and community groups are atomic; blanks cannot erase an existing group member.
Accepted assessments conflict on changed incoming content; explicit reviewed replacement
resets assessment review to unreviewed. Prose and exact Book IDs remain stable.

Exit codes: 0 completed without open issues; 2 completed with nonblocking review issues;
3 blocked before canonical commit; 4 execution/transaction failure; 64 invalid CLI usage.
Inspect the private report before treating an issue-bearing apply as ready for real use.
Enrichment/events are staged and labeled pending; invoking those scopes is rejected here.

## Snapshot-specific reviewed policy

Nonblank series labels require a reviewed source vocabulary. The sanitized specification
mentions four sentinels but omits their spellings; the owner does not know them. No spellings
were invented and no private workbook was opened. Missing policy quarantines series while
preserving raw labels. A later authorized source inspection must establish the actual list.

Use `--policy /PRIVATE/POLICY.json`, mode 0600. All keys below are required; unknown keys,
wrong hashes, duplicate labels/locators and formula locators without actual cached values
are rejected. An empty sentinel list is a deliberate reviewed assertion, not a default.

```json
{
  "version": 1,
  "sourceSha256": "EXACT_SNAPSHOT_SOURCE_SHA256",
  "reviewer": "ACTUAL_REVIEWER",
  "reviewedAt": "ACTUAL_UTC_REVIEW_TIME",
  "seriesSentinels": [],
  "cachedFormulaFields": []
}
```

Formula authorization names exact `SHEET!ADDRESS` cells and asserts cache usability for
this exact snapshot. Original formula/cache evidence remains unchanged. Policy review
metadata is retained in audit/configuration. A date cache without raw serial evidence
still cannot become a canonical date.

## Reviewed conflict resolutions

Use `--resolutions /PRIVATE/RESOLUTIONS.json`, mode 0600. Envelope:
`{"version":1,"entries":[...]}`. Each entry has exactly these fields:

```json
{
  "sourceSha256": "EXACT_SNAPSHOT_SOURCE_SHA256",
  "entityKey": "EXACT_SOURCE_BOOK_ID",
  "field": "notes",
  "expectedHash": "EXACT_CURRENT_SQL_HASH",
  "expectedVersion": "CURRENT_OWNING_ROW_VERSION_AS_STRING",
  "hashVersion": "pg-jsonb-text-v1",
  "reviewer": "ACTUAL_REVIEWER",
  "reviewedAt": "ACTUAL_UTC_REVIEW_TIME",
  "action": "keep_database"
}
```

Actions: `use_source`, `keep_database`, `clear`. Field names come from the closed list in
`resolutions.ts`; compound groups use their group name. Required identity/title/status/
platform/all authors cannot be cleared. Hash expectations use
`library.value_hash('merge.' || FIELD, 'json', CURRENT_GROUP_VALUE::jsonb)`, and the
owning books/feedback/assessment row version. These SQL hashes differ deliberately from
`canonical-json-v1` evidence/configuration hashes. Obtain current values through read-only
SQL inspection on the isolated database; do not fabricate a matching expectation.

The importer rechecks hash and version under its application gate; stale or unused entries
block the whole scope. Legacy year-cell conversion needs reviewed `use_source`; no invented
day is added. Decision, reviewer and review time are audited. Keep-database/clear acknowledges
the valid observed source value as the baseline separately from the canonical retained/cleared
value. A later unchanged source cannot undo that review. Invalid/blank keep-database does not
advance the baseline. Review identities are declarations supplied by the controlled operator;
this local tool is not an authentication or signature system.

## Verification and review

`db:verify` is read-only. It checks source row counts/hashes, exact stable-ID coverage,
required authors, orphan links, current per-field SQL provenance, accepted baseline run/source-entity/closed-field
references and unexpected PUBLIC/public-reader table privileges. It returns a canonical
digest excluding sequence counters; rollback may consume sequence values normally.
Native edits are valid only when their owner operation also refreshes provenance.

Run `pnpm test:db` twice: every integration suite/test receives a fresh disposable database
and distinct role logins; cleanup drops only its recorded databases/roles. Do not stop a
preexisting inspection container/database. Run the full application quality/unit/UI gates
and context/diff checks. See [review package](../review/db-02.md) and
[acceptance handoff](../handoffs/db-02.md) for the actual evidence and remaining review gates.
