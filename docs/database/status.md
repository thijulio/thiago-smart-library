# Database delivery status

Observed 2026-10-02. This document owns ticket state; plans describe future work.
Base: `3841213f6db5ee8bf98620094e2a2ac10881b8ac` (fresh origin/main; connectivity baseline ancestor verified).
DB-00 implementation checkpoint: `921ba256bdbf327eeb23d68067a9071d9443c91a`; subsequent handoff-only commits do not add product behavior.
See [DB-00 evidence and handoff](handoffs/db-00.md).

| Ticket | State                            | Test evidence                                                                            | Review                                                            | PR/head                                | Environment                               |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| DB-00  | implemented-local                | 20 context tests; format/check pass; 10 e2e pass; reference hashes and diff checks pass  | author self-review completed; independent review not performed    | local thijulio/database-context; no PR | local docs/tooling and synthetic UI only  |
| DB-01  | implemented-local                | 87/87 on PostgreSQL 16.15 and 18.6 after review fix; unit/check/context gates pass       | independent technical review passed; exact head accepted by owner | local thijulio/database-schema; no PR  | synthetic disposable local databases only |
| DB-02  | implemented-local pending review | 123/123 twice on fresh PG16.15; 59 importer + 30 database/CLI units; check/test/e2e pass | independent merge-policy/permissions review pending               | local thijulio/database-import; no PR  | synthetic disposable local databases only |
| DB-03  | not-started                      | not performed                                                                            | not performed                                                     | not performed                          | not performed                             |
| DB-04  | not-started                      | not performed                                                                            | not performed                                                     | not performed                          | not performed                             |
| DB-05  | not-started                      | not performed                                                                            | not performed                                                     | not performed                          | not performed                             |

DB-01 core schema, migrations, narrow trusted SQL owner operations and synthetic local harness are implemented locally. DB-02 core importer is implemented locally pending review; owner CLI, public catalogue and cutover remain unimplemented. Implementation checkpoint: `95efb203997ef528e46fd2896dde686eff33f6e6`. See [SQL review package](review/db-01.md) and [DB-01 acceptance handoff](handoffs/db-01.md).
PR #3 connectivity code is present in the verified base. Its historical deployment observation does not establish current cloud health; provider checks were not performed in DB-00.
DB-00 performed no database connection. DB-01 applied SQL only to synthetic disposable PostgreSQL. No hosted connection, real-data import, backup/restore, publication, merge or deployment was performed.

Golden Path DB-01 local checkpoint: `7bc4b589cdaa916218b7a900a493353eed8a66e6` (DB-00 predecessor `9e83c7ff61009e53c28ee274aa40cf79d10394eb`). Proposed ADR 0006, safety workflow and typed site mirror are implemented locally. Site build/test, proposal checks and strict ADR module typecheck pass. Independent review, acceptance, merge and deployment are not performed. DB-00's missing installed dependencies gate is resolved locally.

DB-01 owner acceptance: exact local commit `f1fab44964de84747b0fab981d99b9345cd4151c`
was explicitly accepted in this session before DB-02 work. Its predecessor handoff and recorded
independent SQL/permissions review were verified. Historical pending-acceptance text remains
in the original handoff; this status owns the current state.

DB-02: [acceptance evidence and identities](handoffs/db-02.md), [merge-policy review request](review/db-02.md),
[queried catalog](review/db-02-catalog.json) and [operator runbook](runbooks/core-import.md).
Next: independent review and exact-head owner acceptance of DB-02. Do not begin DB-03.
No private source, Sheet/prototype edit, Neon connection, push, PR, merge or deploy occurred.

Deferred owner request (2026-10-02): [DB-02 Task 02.5](plans/02-import.md#task-025--deferred-local-population-from-the-existing-library) will populate a private local database from the existing library after prerequisite review and later execution authorization. Use the documented Sheet/export source rather than fictional demo books. Planned only; no private-data import performed.

Review correction checkpoint: `b48d4bb6825677a3c14b4a975354bd60023cd168`. Golden Path review follow-up: `5f969f43ee7f5381f624fbf6e8ed23a01912eebf`. The running local inspection database and existing migration checksums are preserved.

Golden Path DB-02: proposed ADR 0007, lossless import workflow and synchronized site metadata implemented locally. Checkpoint `b075f256191279890b23083ea36f30f516156718`; final validation is recorded in the DB-02 handoff. Proposal review/acceptance, merge and publication remain pending.
