# Executor Handoff and Acceptance Matrix

## Start prompt — DB-00

```text
Implement only DB-00 from the Smart Library Database Delivery execution pack.
Start with its README, execution-contracts.md and 00-context.md.
Use the verified current main as the base in an isolated worktree; preserve
existing user work. Follow the plan sequentially. Keep all durable artifacts
in English. Do not touch the Sheet, database, provider settings or prototype.
Do not push, create a PR, merge or deploy. Finish with the handoff template,
changed files, actual checks and exact next ticket. Do not start DB-01.
```

Before DB-00, the pack is in the private context folder at:
`projects/personal-life/smart-library/docs/superpowers/plans/2026-09-20-database-delivery/`.
The user must give the executor that folder plus the linked database spec.
After promotion, use the repository-relative `docs/database/README.md`.

## Start prompt — later ticket

```text
Implement only the ticket I name below, using docs/database/README.md,
docs/database/spec.md, docs/database/plans/execution-contracts.md and its ticket plan.
First verify that the predecessor is accepted and inspect the current branch,
worktree and tests. Use synthetic local PostgreSQL; do not use hosted credentials.
Write the failing tests, implement, and run the specified checks. Preserve all
source data and user changes. Stop at any external/publication gate. Do not
push, merge, deploy, alter the Sheet or begin the following ticket.
Report evidence with docs/database/plans/handoff-and-acceptance.md.
Ticket: [the user supplies DB-01, DB-02, DB-03, DB-04 or local DB-05].
```

This input slot is intentional dispatch data, not an unresolved architecture choice. Never infer “all remaining tickets” from a request for one ticket.

## Ticket handoff template

```markdown
# DB-XX Handoff

## Scope and authority

- Requested ticket and approved environments:
- Explicit exclusions:

## Implementation identity

- Repository / worktree / branch:
- Base SHA / current SHA / uncommitted diff status:
- Prior ticket evidence:

## Delivered files and interfaces

- Created/changed files, grouped by responsibility:
- Public exports, CLI commands and migrations introduced:
- Intentional plan deviations and their approval:

## Verification

| Command/test | Actual result | Evidence location | Environment |
| ------------ | ------------- | ----------------- | ----------- |

## Data and operational state

- Source data used: synthetic / private approved snapshot / none
- Schema applied: local / staging / production / none
- Import scopes and run identifiers:
- Open issues/conflicts/quarantine counts:
- Public publication and active writer state:
- Backup/restore performed and verified:

## Review and publication

- Review: not requested / pending / accepted / changes requested
- PR / CI / merge / deployed SHA: report each separately
- No secrets or raw private data in this handoff

## Next action

- Exact next ticket or blocker:
- Required user decision/approval, if any:
```

Use `not performed` for checks not run. Do not leave template fields blank in the completed handoff. Do not treat an unchecked plan as a green test report.

## Acceptance traceability

| Requirement                                       | Ticket / test area                             | Failure stops            |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| Context discoverable from fresh repo              | DB-00 context checker + fresh-context exercise | implementation handoff   |
| Same stable identity across title corrections     | DB-01 writes / DB-02 I05/I13                   | core acceptance          |
| SQL migration replay and checksum drift           | DB-01 migration integration                    | all database application |
| Real least-privilege connections                  | DB-01 roles / DB-05 public privacy             | hosted/public approval   |
| Preserve all 35 main columns and 7 source tabs    | DB-02 extraction + verify disposition          | import acceptance        |
| Preserve partial dates and raw typing             | DB-01 dates + DB-02 parser tests               | affected field/group     |
| Retry exact seed without changing IDs/versions    | DB-02 I02/I03                                  | importer acceptance      |
| New source updates existing record                | DB-02 I05                                      | importer acceptance      |
| Native edits preserved / conflict explicit        | DB-02 I06/I07/I10                              | importer acceptance      |
| Blank is not delete / older snapshot rejected     | DB-02 I08/I09/I12                              | importer acceptance      |
| Rollback plus retained diagnostics                | DB-02 I11                                      | importer acceptance      |
| Source child reordering/duplicates/native entries | DB-03 collections                              | enrichment acceptance    |
| No guessed recap source edges                     | DB-03 recap validator and composite FKs        | recap publication        |
| Catalogue does not imply personal ownership       | DB-03 import integration                       | enrichment acceptance    |
| Complete immutable historical events              | DB-04 historical replay                        | event acceptance         |
| Concurrent replacement/undo/retry                 | DB-04 multi-client tests                       | runtime vote enablement  |
| Coherent ranking revision incl title/eligibility  | DB-04 cache race tests                         | ranking publication      |
| No private data in HTTP/search/errors/bundle      | DB-05 privacy + browser tests                  | publication              |
| Restore includes source baselines and grants      | DB-05 recovery drill                           | production import        |
| Final export/write freeze/cutover marker          | DB-05 operational checklist                    | canonical switch         |

## Stop conditions that a simpler agent must not “solve” by improvising

- A dependency cannot be installed with the approved registry credential: ask for the missing access; do not replace the design system or commit a token.
- A fixture only passes after deleting assertions/loosening constraints: report the failing invariant and source evidence.
- Snapshot identity/freshness is unknown: extraction/reporting may continue, canonical apply may not.
- A real source value requires interpretation: preserve it and emit a field issue; do not invent its meaning.
- An operation targets a hosted database without named approval: stop before the connection/mutation, retaining completed local work.
- A schema change requires broader ownership/publication/auth behavior: propose a separate scoped extension.
- The reviewer rejects privileges, merge rules or event concurrency: fix that ticket; do not proceed to later tickets to hide the gap.

## Revalidation when execution happens later

Recheck main/predecessor SHA, tool versions and lockfile, installed driver API, actual PostgreSQL major, source hash/freshness, provider role permissions and free-tier limits. Do not re-open settled domain decisions merely because a cheaper model prefers another stack. A concrete incompatibility gets a short documented deviation proposal and focused review.

## Definition of ready for the first implementation

The user has reviewed this pack and authorizes DB-00 (then DB-01 after context review); executor has local repo access, correct Node/pnpm, GitHub package-read access for install, Docker for actual PostgreSQL tests and enough disk for synthetic test DBs. No live Neon secret or auth provider is required to start.
