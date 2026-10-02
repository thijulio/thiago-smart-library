# DB-01 independent technical review — 2026-10-02

State: **implemented-local; independent technical review passed; owner acceptance pending**. This records a fresh reviewer assessment,
not author self-approval or human acceptance. DB-02 implementation and private-data loading have
not started. No push, PR, merge, deployment or cloud operation is authorized by this review.

## Review identity and scope

The owner requested review after the DB-01 delivery. The requesting-code-review workflow used
one independent reviewer context with no author conversation history and no implementation
authority. This separate review followed the completed sequential DB-01 execution.

Reviewed range: complete DB-00 base `9e32edda25105b006d3f03ccf1a9b467231b4cb4` through
DB-01/deferred-task head `90df3e86c672a1a7a7e265b8987bb057de962081`.
The reviewer read repository guidance, specification, execution contracts, DB-01 plan, SQL,
adapters, harness, test coverage, CI and the original review package. Targeted probes used only
fresh disposable synthetic databases and preserved the existing DBeaver inspection database.

## Findings and disposition

**P2 — incomplete empty-target inventory: fixed.** The initial bootstrap and migration preflight
counted relations but missed existing routines, types/domains and metadata sequences. A database
containing only a preexisting public routine was marked synthetic and migrated successfully,
violating the approved-empty-target contract. The reviewer reproduced this before requesting changes.

`libs/database/src/bootstrap.ts` now inventories namespace dependencies across catalogs. Unmarked
initialization permits no user objects; first migration permits only the validated environment
marker relation and its dependent objects. Both entrypoints use this shared check before bootstrap
writes. Eight real PostgreSQL regression cases cover unmarked routine/enum/domain/sequence and
marked public/metadata routines, metadata enum and sequence. Rejection leaves the marker/domain
schema/migration history untouched and preserves an existing marker UUID. Seven new regressions
failed against the old code; all 11 bootstrap tests passed after the fix.

The reviewer inspected the correction and reported: P2 resolved, no further actionable inventory
gap identified, technical review gate can pass once full tests and quality checks pass. No other
blocker was identified in SQL permissions, definer contexts, history/checksums, lock ordering,
transaction retries, date/numeric constraints, identity, request replay or owner operations.

**Informational — controlled importer trust boundary: DB-02 acceptance requirement.** The importer
has intentionally granted direct DML. A direct synthetic assessment update can retain an accepted
review marker and leave versions/provenance stale. This is not treated as a DB-01 defect because
the approved controlled importer owns conflict handling and atomic version/provenance changes.
DB-02 must test protection of accepted assessments and atomic canonical/baseline/provenance updates;
SQL grants alone do not implement those policies. The editor owner operation correctly resets
assessment review on content replacement.

## Validation

- Reviewer independently ran database unit tests: 21/21 passed.
- Reviewer independently ran PostgreSQL 16.15 core/date/role/write tests: 65/65 passed, zero skips.
- Reviewer reproduced the finding and importer boundary in fresh synthetic databases, then cleaned them.
- Author fix validation: eight new regressions, RED 7 failures/4 passes, GREEN 11/11 passes.
- Final complete PostgreSQL 16.15 and 18.6 suites: **87/87 passed on each major**, zero skips.
- Final application `pnpm check`: passed format, lint, typecheck, unit, both builds, actual browser boundary and governance-policy checks. Final context links, format and diff checks passed as recorded by the executor.

All four SQL migration files are unchanged, so their exact checksums and the original sanitized
catalog remain valid. This correction changes target preflight code and tests only; no applied
migration has been edited and the user's inspection database does not need a schema reset.

Golden Path follow-up checkpoint `5f969f43ee7f5381f624fbf6e8ed23a01912eebf` documents full namespace
inventory and pre-marker/pre-migration rejection in the reusable workflow. Its two proposal/site
mirror checks pass and its diff is clean. ADR 0006 remains proposed; no site metadata, stack,
provider or technology-radar decision changed. Existing full site build/test evidence remains in
the [original handoff](../handoffs/db-01.md); those site sources were unchanged by this follow-up.

## Acceptance boundary

The technical reviewer is independent of the implementer; its assessment is not human acceptance.
Correction checkpoint: `b48d4bb6825677a3c14b4a975354bd60023cd168`. The full tests and required
quality gate passed, satisfying the reviewer's stated technical completion condition.
DB-01 remains implemented locally. Owner acceptance and explicit DB-02 execution authorization
are separate. Real-data loading is still the deferred DB-02 task. The inspection database stays
running. The exact extra PostgreSQL 18 review container
`85684ff3e66a3f30424e6ebf47865b5dda680bae3478afad1971676a79c53696` was removed after
image, label, loopback, tmpfs and synthetic-marker checks. Its initial bootstrap attempt preceded
server readiness and failed closed; the healthy-server retry and full suite passed.
