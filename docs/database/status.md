# Database delivery status

Observed 2026-10-02. This document owns ticket state; plans describe future work.
Base: `3841213f6db5ee8bf98620094e2a2ac10881b8ac` (fresh origin/main; connectivity baseline ancestor verified).
DB-00 implementation checkpoint: `921ba256bdbf327eeb23d68067a9071d9443c91a`; subsequent handoff-only commits do not add product behavior.
See [DB-00 evidence and handoff](handoffs/db-00.md).

| Ticket | State             | Test evidence                                                                           | Review                                                         | PR/head                                | Environment                               |
| ------ | ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| DB-00  | implemented-local | 20 context tests; format/check pass; 10 e2e pass; reference hashes and diff checks pass | author self-review completed; independent review not performed | local thijulio/database-context; no PR | local docs/tooling and synthetic UI only  |
| DB-01  | implemented-local | 79/79 on PostgreSQL 16.15 and 18.6; unit/check/e2e/context gates pass                   | awaiting independent SQL/permissions review                    | local thijulio/database-schema; no PR  | synthetic disposable local databases only |
| DB-02  | not-started       | not performed                                                                           | not performed                                                  | not performed                          | not performed                             |
| DB-03  | not-started       | not performed                                                                           | not performed                                                  | not performed                          | not performed                             |
| DB-04  | not-started       | not performed                                                                           | not performed                                                  | not performed                          | not performed                             |
| DB-05  | not-started       | not performed                                                                           | not performed                                                  | not performed                          | not performed                             |

DB-01 core schema, migrations, narrow trusted SQL owner operations and synthetic local harness are implemented locally. Importer, owner CLI, public catalogue and cutover remain unimplemented. Implementation checkpoint: `95efb203997ef528e46fd2896dde686eff33f6e6`. See [SQL review package](review/db-01.md) and [DB-01 acceptance handoff](handoffs/db-01.md).
PR #3 connectivity code is present in the verified base. Its historical deployment observation does not establish current cloud health; provider checks were not performed in DB-00.
DB-00 performed no database connection. DB-01 applied SQL only to synthetic disposable PostgreSQL. No hosted connection, real-data import, backup/restore, publication, merge or deployment was performed.

Golden Path DB-01 local checkpoint: `7bc4b589cdaa916218b7a900a493353eed8a66e6` (DB-00 predecessor `9e83c7ff61009e53c28ee274aa40cf79d10394eb`). Proposed ADR 0006, safety workflow and typed site mirror are implemented locally. Site build/test, proposal checks and strict ADR module typecheck pass. Independent review, acceptance, merge and deployment are not performed. DB-00's missing installed dependencies gate is resolved locally.

Next: independent SQL/permissions review of DB-01; do not start DB-02 before accepted DB-01 evidence and separate authorization.
