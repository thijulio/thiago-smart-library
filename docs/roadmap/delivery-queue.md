# Delivery queue

Planning snapshot: 2026-10-10. Live status remains in
[Libraries](https://github.com/users/thijulio/projects/8), issues and milestones.
This is the recommended working order, not a duplicate status database.

| Order                        | Ticket                                                                                                                                                                                                                                                                                                                                        | Milestone | Dependency or gate                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Now, 1                       | [#28 — Integrate the published private-library product and release evidence](https://github.com/thijulio/thiago-smart-library/issues/28)                                                                                                                                                                                                      | M0        | Existing code and hosted handoff; no push/merge/deploy without concrete approval                                |
| Now, 2                       | [#44 — Verify private beta access and two-user isolation](https://github.com/thijulio/thiago-smart-library/issues/44)                                                                                                                                                                                                                         | M0        | #28 integration; hosted second account and provider admission require owner action/approval                     |
| Now, evidence reconciliation | [#26 — First production import (core)](https://github.com/thijulio/thiago-smart-library/issues/26)                                                                                                                                                                                                                                            | M0        | Verify original private acceptance before closing; do not repeat the import                                     |
| Next, 1                      | [#45 — Current reading and existing Up Next choices](https://github.com/thijulio/thiago-smart-library/issues/45)                                                                                                                                                                                                                              | M1        | #28/#44; approved read-view design and existing queue contract; no ranking dependency                           |
| Next, 2                      | [#7 — Import enrichment](https://github.com/thijulio/thiago-smart-library/issues/7)                                                                                                                                                                                                                                                           | M1        | User-scoped enrichment design, reconciliation and separate hosted approval                                      |
| Next, 3                      | [#8 — Comparison history and rankings](https://github.com/thijulio/thiago-smart-library/issues/8)                                                                                                                                                                                                                                             | M1        | Existing dependency #7; review feature-specific dependency before changing it; private ownership/cache contract |
| Next, blocked                | [#46 — Add/update books in a private library](https://github.com/thijulio/thiago-smart-library/issues/46)                                                                                                                                                                                                                                     | M2        | #28/#44; approved writer-authority decision, data amendment and feature design                                  |
| Later                        | [#27 — Scoped MCP access/capture in ChatGPT and Claude](https://github.com/thijulio/thiago-smart-library/issues/27)                                                                                                                                                                                                                           | M3        | Read APIs; #46 and remaining M2 writer operations for confirmed capture; real-client acceptance                 |
| Cutover                      | [#10 — Hosted rehearsal](https://github.com/thijulio/thiago-smart-library/issues/10), [#11 — Canonical cutover](https://github.com/thijulio/thiago-smart-library/issues/11)                                                                                                                                                                   | M5        | Complete replacement acceptance and concrete operational approvals                                              |
| Uncommitted candidates       | [#14](https://github.com/thijulio/thiago-smart-library/issues/14), [#15](https://github.com/thijulio/thiago-smart-library/issues/15), [#16](https://github.com/thijulio/thiago-smart-library/issues/16), [#17](https://github.com/thijulio/thiago-smart-library/issues/17), [#18](https://github.com/thijulio/thiago-smart-library/issues/18) | Backlog   | Revalidate old assumptions; choose one outcome before promoting                                                 |
| Independent contribution     | [#24 — Golden Path findings](https://github.com/thijulio/thiago-smart-library/issues/24)                                                                                                                                                                                                                                                      | Backlog   | Separate concrete scope; not an M0 product gate                                                                 |

## Tracking corrections

- Existing milestone numbers and board are preserved; no new roadmap epic,
  duplicate import task or spike infrastructure ticket is created.
- #27's standalone throwaway scope is superseded by T-13. Google login success
  does not satisfy its remaining MCP requirements; it stays open in M3.
- #28's old agent-specific cleanup scope is replaced with release integration.
  No worktree deletion or private-memory update is authorized.
- #24 is independent under T-11. Old cross-repository rebase instructions are
  historical until a new contribution scope is accepted.
- #7/#8 retain original reconciliation/replay criteria, with current multiuser
  ownership and next-free-migration prerequisites added.
- No milestone is marked complete from a manual deployment or closed historical
  epic. #26 remains open until its full original acceptance is reconciled.

## Working session handoff

Select the first unblocked ticket and state its scope. Read the current branch,
dirty changes, predecessor evidence and applicable data/UI contract. Prepare
the feature design where needed before implementation. Record tests/review and
the exact Git/CI state. Stop at the concrete external-operation approval gate,
with the proposed operation and recovery evidence ready to review.

GitHub ticket bodies contain self-contained acceptance criteria. Publication of
these planning documents does not make proposed product priorities approved.
