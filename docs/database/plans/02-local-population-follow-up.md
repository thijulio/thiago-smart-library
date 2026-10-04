# DB-02 compatibility and private local population

Authorized 2026-10-04 by the owner's request to finish the proposed DB-02 completion and real-library import. Original Sheet, hosted services, publication, merge and DB-03 implementation remain excluded.

## Design and execution

1. Preserve existing schema and immutable migrations. Accept strict ISO timestamp offsets and known reading display symbols. Legacy month/year completion proposals remain reviewed; support source-hash-bound first-insert resolutions using absent version `0` and the SQL hash of null, only for completion `use_source`. Existing expected-version protection remains.
2. Keep default test targets unchanged. Add explicit `local-library` target with fixed loopback endpoint, separate database name, persistent private storage, `staging` marker and pinned instance identity. No test cleanup may accept it. Provision distinct importer and private editor/reader logins. Store random credentials only in owner-only files outside Git. Provide private backup and local connection instructions.
3. Verify the migration working copy and retain an immutable private XLSX snapshot. Review exact source sentinel/cache policy and completion proposals. No Sheet changes or guessed citations.
4. Run synthetic regression tests first, two complete disposable PostgreSQL suites, application quality and E2E gates. Obtain independent technical review of DB-02 and the corrections before real-data application. Current owner authorization covers the proposed local rehearsal/population after technical review; it does not imply approval of unresolved findings.
5. Dry-run the reviewed export, then apply only core records to the persistent local target. Check all source IDs, authors/genres/series, ratings, dates, timestamps, raw evidence and provenance. Replay and compare canonical digest/versions. Create and verify a private backup. Keep enrichment and events staged for later slices.
6. Update status/handoff and migration filenames for DB-03/04. Record reusable Golden Path findings locally without publication.

## Acceptance

No unresolved blocking issues, no loss of valid core fields, no fabricated dates, no private data in Git, no original-Sheet edits, unchanged canonical state on replay, and persistent local records accessible through a private reader login. Source defects/sentinels and later-scope recap issues remain explicit rather than counted as fully normalized data.
