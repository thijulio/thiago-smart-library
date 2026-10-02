# Delivery roadmap

Planning snapshot: 2026-10-02. This folder owns delivery sequence, dependencies and requirement-to-ticket mapping. [Product documentation](../product/README.md) owns the specification. GitHub issues track individual work items and evidence.

## Now

Accept the locally implemented DB-00 context package and independently review its evidence. It has not been integrated into main. The next implementation slice is DB-01 after context acceptance and separate authorization.

The ChatGPT-only direction is confirmed. Hosted eligibility, authentication design and the first AI action remain discovery work; this does not change database delivery order.

## Next — database delivery

| Phase | Ticket                                                               | Outcome                                            | Dependency                                  |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| M1    | [DB-00](https://github.com/thijulio/thiago-smart-library/issues/4)   | Context acceptance and portable execution baseline | Verified connectivity baseline              |
| M2    | [DB-01](https://github.com/thijulio/thiago-smart-library/issues/5)   | Isolated relational foundation                     | DB-00 accepted                              |
| M3    | [DB-02](https://github.com/thijulio/thiago-smart-library/issues/6)   | Lossless incremental core import                   | DB-01 accepted                              |
| M4    | [DB-03](https://github.com/thijulio/thiago-smart-library/issues/7)   | Enrichment and exact provenance                    | DB-02 accepted                              |
| M5    | [DB-04](https://github.com/thijulio/thiago-smart-library/issues/8)   | Immutable comparisons and coherent rankings        | DB-03 accepted                              |
| M6    | [DB-05](https://github.com/thijulio/thiago-smart-library/issues/9)   | Local owner workflow, safe reads and recovery      | DB-04 accepted                              |
| M7    | [OPS-01](https://github.com/thijulio/thiago-smart-library/issues/10) | Hosted rehearsal and real-data validation          | DB-05 local acceptance                      |
| M8    | [OPS-02](https://github.com/thijulio/thiago-smart-library/issues/11) | Canonical cutover and rollback acceptance          | OPS-01; owner acceptance of usable workflow |

DB-05 owns local tasks 05.1–05.4. OPS-01 owns hosted rehearsal 05.5 and OPS-02 owns canonical cutover 05.6. Local acceptance, hosted rehearsal and cutover are distinct outcomes. DB-03 then DB-04 remains the source plan's sequence.

## Parallel — governance qualification

[GOV-01](https://github.com/thijulio/thiago-smart-library/issues/12) — Qualify the published governance pilot in Smart Library. Wait for genuinely published and validated governance-core 0.1.0 before installing or pinning it. Existing upstream implementation does not prove publication.

## Future — product discovery

| Ticket                                                                | Outcome                                            | Planning state                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [DISC-01](https://github.com/thijulio/thiago-smart-library/issues/13) | Private browser workflows and authentication scope | ChatGPT-only product direction confirmed; design, eligibility and implementation pending |
| [DISC-02](https://github.com/thijulio/thiago-smart-library/issues/14) | Grounded asynchronous enrichment                   | ChatGPT-only product direction confirmed; design, eligibility and implementation pending |
| [DISC-03](https://github.com/thijulio/thiago-smart-library/issues/15) | Multilingual retrieval and embedding evaluation    | Deferred; scope not approved                                                             |
| [DISC-04](https://github.com/thijulio/thiago-smart-library/issues/16) | Reviewable preferences and reading suggestions     | Deferred; scope not approved                                                             |
| [DISC-05](https://github.com/thijulio/thiago-smart-library/issues/17) | Export and portability contract                    | Deferred; scope not approved                                                             |
| [DISC-06](https://github.com/thijulio/thiago-smart-library/issues/18) | Reading history, editions and ownership extensions | Deferred; scope not approved                                                             |

These are discovery scopes, not implementation commitments. DISC-06 records deferred extension candidates. No estimates or target dates are invented; progression depends on accepted evidence and approval of the relevant slice.

## Traceability and source ownership

- [Requirement mapping](traceability.md) connects requirements to their acceptance owner.
- [Product overview](../product/overview.md), [journeys](../product/user-experience.md) and [decisions](../product/decisions.md) describe intended behavior.
- The canonical database spec, execution addendum, status and detailed plans retain their ownership under `docs/database/` in the DB-00 delivery worktree. They are pending repository integration; no published link is claimed here. The addendum takes precedence for specific rules.
- Original private studies and workbook evidence remain provenance. They are not a second implementation contract or CI fixtures.
- [Ticket manifest](ticket-manifest.json) maps stable IDs to GitHub issues. The Markdown files in `tickets/` are preserved preparation snapshots, not a second live tracker or the product specification. Edit GitHub issues for live work state and keep this roadmap's dated snapshots explicit.

## Completion rules

Each delivery handoff records the exact head, checks actually run, independent review, data/environment touched and outstanding gates. Local code, CI, publication, deployment and canonical cutover remain separate states. Prototype records stay unchanged until explicit cutover. Maintain Golden Path alignment evidence for every delivery ticket and propose shared changes only for demonstrated reusable findings.

## Documentation publication

These pages are published on the documentation branch for review; integration into main remains pending. GitHub issues link to the published branch documents. Issue #19 tracks this documentation change and can be retired once repository integration is accepted. The detailed DB-00 execution package remains a separate integration.
