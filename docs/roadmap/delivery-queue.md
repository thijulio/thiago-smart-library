# Delivery queue

Planning snapshot: 2026-10-10. Live progress is in
[Libraries](https://github.com/users/thijulio/projects/8), issues and milestones.
This page records order/dependencies rather than duplicating task status.

## Next product slices

| Order                     | Ticket                                                                                                   | Milestone | Dependency or gate                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 1                         | [#45 — Current reading and existing Up Next](https://github.com/thijulio/thiago-smart-library/issues/45) | M1        | First UI design; scoped records; #44 before hosted multiuser acceptance. No AI/writes/imports.    |
| 2                         | [#50 — Scoped AI results and plan storage](https://github.com/thijulio/thiago-smart-library/issues/50)   | M2        | Reviewed native/imported/derived authority and recovery contract; hosted SQL approval separately. |
| 3                         | [#51 — Refresh saved results on events](https://github.com/thijulio/thiago-smart-library/issues/51)      | M2        | #50; reviewed refresh/provider design, credit eligibility and budget.                             |
| 4                         | [#14 — Reusable book enrichment](https://github.com/thijulio/thiago-smart-library/issues/14)             | M2        | #50/#51; reliable sources, selected inexpensive model and evaluated characteristics.              |
| 5                         | [#16 — Jev taste relevance](https://github.com/thijulio/thiago-smart-library/issues/16)                  | M2        | #50/#51/#14; preference inputs and rubric. Historical imports only where needed.                  |
| 6                         | [#52 — Kindle/audiobook suitability](https://github.com/thijulio/thiago-smart-library/issues/52)         | M2        | #14/#16/#50/#51; edition evidence and format rubric.                                              |
| 7                         | [#53 — Independent ordered plans](https://github.com/thijulio/thiago-smart-library/issues/53)            | M2        | #45/#16/#52/#51; horizon, eligibility and sequence evaluation.                                    |
| Alongside after authority | [#46 — Books, status and feedback](https://github.com/thijulio/thiago-smart-library/issues/46)           | M2        | #50 authority; #44 acceptance; separate imported-status decision. AI never gates saving.          |
| 8                         | [#54 — Move later with a reason](https://github.com/thijulio/thiago-smart-library/issues/54)             | M2        | #50/#51/#53; #46 for finish/feedback loop; reason duration and placement rules.                   |
| 9                         | [#15 — Story filtering with Jev](https://github.com/thijulio/thiago-smart-library/issues/15)             | M4        | #14/#50/#51; query/evidence evaluation. Embeddings only if justified; no MCP dependency.          |

## Existing obligations and later work

| Track                      | Tickets                                                                                                                                                                                                 | Meaning                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Completed baseline         | [#28](https://github.com/thijulio/thiago-smart-library/issues/28), [PR #48](https://github.com/thijulio/thiago-smart-library/pull/48)                                                                   | Main integration and 2026-10-10 production publication recorded. No repeat import/release for cleanup.      |
| Remaining M0 acceptance    | [#44](https://github.com/thijulio/thiago-smart-library/issues/44), [#26](https://github.com/thijulio/thiago-smart-library/issues/26)                                                                    | Multiuser/onboarding and prior original import acceptance; no new resources/reimport implied.               |
| Historical evidence/parity | [#7](https://github.com/thijulio/thiago-smart-library/issues/7), [#8](https://github.com/thijulio/thiago-smart-library/issues/8)                                                                        | Preserve enrichment/comparison reconciliation/replay. Extend ownership safely; hosted approvals separately. |
| Assistant access           | [#27](https://github.com/thijulio/thiago-smart-library/issues/27)                                                                                                                                       | M3 ChatGPT/Claude reads/capture on existing resources; Google login does not prove MCP acceptance.          |
| Cutover                    | [#10](https://github.com/thijulio/thiago-smart-library/issues/10), [#11](https://github.com/thijulio/thiago-smart-library/issues/11)                                                                    | M5 full parity, reconciliation, recovery, canonical switch and explicit retirement.                         |
| Backlog                    | [#17](https://github.com/thijulio/thiago-smart-library/issues/17), [#18](https://github.com/thijulio/thiago-smart-library/issues/18), [#24](https://github.com/thijulio/thiago-smart-library/issues/24) | Portability, broader history/editions and independent Golden Path contribution.                             |

## Planning reconciliation

The owner promoted enrichment (#14), taste relevance (#16) and story filtering
(#15) from generic discovery to concrete planned slices. Historical ChatGPT-only
and embedding-first assumptions are replaced in those issue bodies. The scopes
are planned, not approved technical designs or hosted execution grants.

Five new tickets (#50–#54) cover distinct missing implementation work. #45/#46
keep their read/capture scopes with links to the new contract/plan work. Existing
milestone identities and board remain; no phase epics, duplicate imports or
standalone spike infrastructure are created.

## Working session handoff

Start with #45's Reading design. Verify branch/dirty state, predecessor evidence
and scoped DTO/data availability. Inspect the prototype read-only as the UX
reference. Present its short design before product implementation.

For later AI slices, read the discussion, #50's reviewed authority contract and
the selected ticket's dependencies. Keep reading actions independent of model
availability; refresh saved results only when their inputs change.

Run implementation checks and record review/Git/CI evidence. Prepare hosted
operations with exact target, effect and recovery before owner approval. Issue
creation or a documentation merge completes no feature and authorizes no hosted
mutation.
