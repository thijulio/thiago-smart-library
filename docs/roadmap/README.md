# Smart Library roadmap

Planning snapshot: 2026-10-10. The owner identified the highest-value workflows
in the [AI/product discussion](../product/ai-recommendations.md): current reading,
personal taste relevance, Kindle/audiobook suitability, independent ordered
reading plans with reason-based postponement, then story filtering. The sequence
below is the proposed delivery plan; technical designs and external operations
still need their applicable reviews/approvals.

GitHub milestones/issues own live status. This document owns goals, sequence and
exit checks. Use the existing [Libraries board](https://github.com/users/thijulio/projects/8).
See the [product brief](../product/overview.md), [benchmark](../product/benchmark-2026-10-10.md)
and [delivery queue](delivery-queue.md).

## Baseline and destination

Private Library/search/detail and Google sign-in are integrated into main through
[PR #48](https://github.com/thijulio/thiago-smart-library/pull/48), commit b248673.
The 2026-10-10 release record in [#28](https://github.com/thijulio/thiago-smart-library/issues/28)
records the Git-backed production publication; that ticket is closed. This is a
dated release record, not a new production check by the planning work.

Google's Testing audience still limits admission; [#44](https://github.com/thijulio/thiago-smart-library/issues/44)
owns remaining hosted multiuser acceptance. [#26](https://github.com/thijulio/thiago-smart-library/issues/26)
owns reconciliation of the original private import evidence, not another import.
Neither open item prevents local design of the Reading screen.

The near-term product is a familiar Reading workspace that answers: what am I
reading, which books fit my taste, which format suits them and what comes next
on each platform? Book enrichment and Jev results are persisted; meaningful
changes trigger refresh. Page visits reuse saved results. The prototype's
Library, Reading, Stats and Favorites organization is the reference.

Full prototype replacement and explicit Sheet retirement remain the M5
destination. This prioritization does not silently waive parity or change data
authority.

## Delivery sequence

| Step                              | Reader outcome                                             | Tickets                                                                                                                              | Exit check                                                                                                 |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1. Reading screen                 | Current reading per platform and existing explicit Up Next | [#45](https://github.com/thijulio/thiago-smart-library/issues/45)                                                                    | Private, accessible desktop/mobile view; honest missing states; no fabricated AI queue                     |
| 2. Durable calculation foundation | Save judgments and refresh affected results                | [#50](https://github.com/thijulio/thiago-smart-library/issues/50), [#51](https://github.com/thijulio/thiago-smart-library/issues/51) | Reviewed authority, scoped storage, lineage, retry-safe refresh and no model calls on page views           |
| 3. Book evidence and taste        | Useful book characteristics and personal relevance         | [#14](https://github.com/thijulio/thiago-smart-library/issues/14), [#16](https://github.com/thijulio/thiago-smart-library/issues/16) | Reusable source-backed enrichment, reviewable preferences and evaluated Jev judgments                      |
| 4. Best format                    | Compare Kindle/audiobook suitability                       | [#52](https://github.com/thijulio/thiago-smart-library/issues/52)                                                                    | Explicit rubric, edition evidence, stored factors and honest unknowns                                      |
| 5. Planned next reads             | Next three entries of an ordered plan per platform         | [#53](https://github.com/thijulio/thiago-smart-library/issues/53)                                                                    | Independent platform sequences, series constraints, pacing and complete stored revisions                   |
| 6. Keep the plan useful           | Finish/update a book and move a book later with a reason   | [#46](https://github.com/thijulio/thiago-smart-library/issues/46), [#54](https://github.com/thijulio/thiago-smart-library/issues/54) | Actions persist without AI; deferral respected; affected plans refresh without turning timing into dislike |
| 7. Story filtering                | Find books matching described stories/characters           | [#15](https://github.com/thijulio/thiago-smart-library/issues/15)                                                                    | Evaluated relevance, description evidence, scoped saved query results and bounded cost                     |

Steps are priority order, not an instruction to serialize independent design.
Core capture/status work in #46 can proceed alongside scoring once #50's writer
contract is accepted. #7 enrichment import and #8 comparison/ranking parity
provide historical evidence where needed; they do not block every explicit-
preference scoring design. Exact prerequisites live in each ticket.

**First delivery ticket: #45.** Review the prototype's Reading flow and available
scoped DTOs, present its short design, then implement the accepted slice. Do not
install AI dependencies or call providers as part of #45.

## Milestones — preserve existing identities

| Milestone                                                                                 | Goal and exit checks                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [M0 — Takeover](https://github.com/thijulio/thiago-smart-library/milestone/11)            | Reproducible private release. #28 complete; #44 isolation/onboarding and #26 original import acceptance remain. Closed historical epics do not complete the milestone.                                              |
| [M1 — Read parity](https://github.com/thijulio/thiago-smart-library/milestone/12)         | Reading/Up Next, Library/detail, Stats, Favorites and recap browsing; scoped enrichment/comparison imports and honest freshness. #45 is the first UI slice.                                                         |
| [M2 — Identity and writes](https://github.com/thijulio/thiago-smart-library/milestone/13) | Approved scoped writers, stored enrichment/taste/format results and independent plans; refresh, finish/feedback and deferral loop. Core create/edit/archive/restore and Book Battle/undo remain parity obligations. |
| [M3 — MCP](https://github.com/thijulio/thiago-smart-library/milestone/14)                 | Real ChatGPT/Claude OAuth, consent/revocation, isolated reads and confirmed capture using browser writer rules. #27 remains open; no standalone spike.                                                              |
| [M4 — Remaining parity](https://github.com/thijulio/thiago-smart-library/milestone/15)    | Story filtering plus remaining replacement capabilities, including Playground, jobs and cover lookup. Filtering depends on evidence/refresh, not MCP admission.                                                     |
| [M5 — Cutover](https://github.com/thijulio/thiago-smart-library/milestone/16)             | Full replacement acceptance, reconciliation/freeze, backup/restore, writer switch and rollback boundary; canonical marker and Sheet retirement via #10/#11.                                                         |
| [Backlog](https://github.com/thijulio/thiago-smart-library/milestone/17)                  | Unselected expansion: embeddings, broader preference learning, portability #17 and history/edition extensions #18. Promote a concrete evaluated use case.                                                           |

MCP is a planned assistant channel, not a prerequisite for the in-app Jev loop.
Stats/Favorites/recap parity stays visible, but is not ahead of the owner's
Reading priorities. Published Biome CSS supports initial slices; Vue package
work gates only features needing those components.

## Data authority and AI execution

#50 must specify how app-owned derived scores, plans and reasons coexist with
Sheet-owned imported facts. Settle status/completion/feedback authority before
#46 changes imported records. Review importer protection, concurrency, recovery
and least-privilege routines before hosted persistence. No global write flag or
pre-M5 exception is accepted by this roadmap.

Jev through Vercel AI Gateway is the intended decision integration to explore;
the inexpensive enrichment model remains undecided. Verify credit eligibility,
minimal outbound context, provider logging/retention and evaluation cost before
paid or real-data calls. Jev judges focused factors; code owns permissions,
arithmetic, eligibility and ordering. Confidence is not an enjoyment metric.

Reuse the existing Neon project/database, Netlify site and Nuxt/Nitro app. No
spike resources, reimport or hosting move. Migrations, imports and model calls
never run at build or function startup.

## Open design choices

- Initial taste evidence/rubric and correction of inferred preferences.
- Format criteria/weights and reliable edition/narrator evidence.
- Plan horizon and duration of a postponement reason.
- Refresh scheduling, retries, revision consistency, provider cost and privacy.
- Enrichment vocabulary and story-query evaluation examples.

Resolve these in their feature designs. The first Reading design does not wait
for every later AI choice. Use synthetic local evaluation; owner-approved
private acceptance stays outside Git/logs/prompts.

## Tracking and release rules

- Todo / In Progress / Done remain the board states. Todo means planned work;
  reviewed design and dependency readiness precede implementation.
- Product intent/phases live in documents; issues contain executable work,
  acceptance, dependencies and evidence. No duplicate phase/epic issues or dates.
- Implementation runs `pnpm check`; DB work also real-PostgreSQL `pnpm test:db`;
  relevant UI/HTTP work also `pnpm test:e2e`.
- Report local checks, review, Git/CI, merge, hosted operations and publication
  separately. Merges, deploys, hosted SQL/imports, provider changes and cutover
  need concrete owner approval.
- Preserve user ownership, server/browser separation and published Biome.
  The prototype repository, canonical Sheet and site stay untouched.

## Replacement checklist

Private Library/filters · detail with same-author books, series and quotes ·
Reading/Up Next · Stats · private Favorites ranking · Book Battle/undo · recap
reader · create/edit/archive/restore · Playground · community ratings and author
highlights jobs · cover lookup · MCP capture from ChatGPT/Claude · recovery and
explicit Sheet cutover. New AI priorities augment this checklist.
