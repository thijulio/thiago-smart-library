# Requirement traceability

| Requirement group                                                        | Ticket / acceptance owner                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Portable current context and one technical owner                         | DB-00                                                |
| Core entity tiers, relationships, constraints, dates and least privilege | DB-01                                                |
| All seven tabs / 35 main columns retained with private evidence          | DB-02                                                |
| Stable identity, replay, new snapshots and native-edit merge             | DB-01, DB-02                                         |
| Quarantine, source-owned collections and exact recap provenance          | DB-03                                                |
| Immutable history, replacement/undo and real concurrent writes           | DB-04                                                |
| Coherent ranking revisions, eligibility and every writer's invalidation  | DB-04                                                |
| Private owner workflow and durable book/feedback operations              | DB-05                                                |
| Public allowlist, private-term leakage prevention, disabled catalogue    | DB-05; publication separately gated                  |
| Backup/restore including grants, baselines and target identity           | DB-05, OPS-01                                        |
| Fresh export, writer freeze, canonical marker and rollback               | OPS-02                                               |
| Published governance qualification and controlled failing pilot          | GOV-01                                               |
| Published Biome consumption and conditional upstream gaps                | Existing foundation; invariant in every UI ticket    |
| Golden Path shared-config and database-tier alignment gaps               | DB-00 review; revalidation in every delivery handoff |
| AI-independent recording, grounded assistance and user control           | DB-05, DISC-01, DISC-02, DISC-04                     |
| Optional retrieval, versioned embeddings and PT/EN evaluation            | DISC-03                                              |
| Sheets as export/reference surface                                       | DISC-05                                              |
| Single owner, no inferred editions/copies/rereading/multi-tenancy        | DB-01 invariant; DISC-06 only if separately approved |

The detailed source acceptance matrix remains authoritative for individual test scenarios (including DB-02 I02–I13). Every existing task 00.1–05.6 is represented in a delivery ticket. Foundation LIB-09–LIB-11 map to GOV-01; historical LIB-12 deployment evidence must be rechecked for any future release, not recreated or claimed current here. Conditional Design System work requires an actual shared gap; PMP adoption remains outside this program.

See the [roadmap](README.md) for sequence and [product documentation](../product/README.md) for intended behavior. Detailed database tests remain defined by the canonical DB-00 execution pack, pending integration.
