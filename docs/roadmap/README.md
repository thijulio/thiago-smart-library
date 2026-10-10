# Smart Library roadmap

> 2026-10-10: the owner reopened product definition for interactive brainstorming.
> Treat this document as working material. Proposed priorities and exceptions
> are not approved implementation scope; current data/privacy contracts remain in force.

Refined planning snapshot: 2026-10-10. The [product brief](../product/overview.md)
and [source review](../product/direction-and-evidence.md) recover previous intent;
the [benchmark](../product/benchmark-2026-10-10.md) informs proposed priorities.
GitHub milestones/issues own live status; this page owns goals, sequence and
exit checks. Use the existing [Libraries board](https://github.com/users/thijulio/projects/8).

## Destination and current position

A reader keeps private books and reactions, chooses what to read, revisits past
reading, and optionally uses an assistant with grounded context. Replacement
still requires full prototype parity and Sheet retirement (T-02). T-13 removes
the standalone spike; T-14 establishes private libraries for any user.

The first browsing slice was manually published on 2026-10-09 and the founder
confirmed access. Git/release integration is tracked in #28; Google login remains
restricted by the Testing audience; writes and MCP are not delivered. The imported library
remains Sheet-owned. Closed historical roadmap epics do not mean their
milestones are complete.

## Milestones — preserve existing identities

| Milestone                                                                                 | Reader or operational outcome                   | Exit checks                                                                                                                                                                             | Depends on                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [M0 — Takeover](https://github.com/thijulio/thiago-smart-library/milestone/11)            | Reproducible, reviewed private-library release  | Published changes integrated with green required checks; sanitized import acceptance reconciled; release/recovery handoff current; isolation verified; onboarding restrictions explicit | Current release evidence                                        |
| [M1 — Read parity](https://github.com/thijulio/thiago-smart-library/milestone/12)         | Read and revisit the existing private library   | Private Library/detail, Reading/Up Next, Stats, Favorites and recap reader; enrichment/ranking reconciliation; honest freshness/missing-data states                                     | M0; relevant data imports for dependent views                   |
| [M2 — Identity and writes](https://github.com/thijulio/thiago-smart-library/milestone/13) | Populate a library and record reading/reactions | Approved multiuser writer contract; create/edit/archive/restore, status/feedback, queue and Book Battle/undo pass isolation/concurrency checks; hosted enablement separately approved   | M0; relevant M1 data/features; authority decision before writes |
| [M3 — MCP](https://github.com/thijulio/thiago-smart-library/milestone/14)                 | Use the same library from ChatGPT and Claude    | Scoped OAuth, consent/revocation, real-client reads and confirmed capture; same validation as browser; transport/latency/failure evidence                                               | Product read APIs; M2 for writes                                |
| [M4 — Remaining parity](https://github.com/thijulio/thiago-smart-library/milestone/15)    | Preserve remaining prototype workflows          | Explicit parity checklist passes, including Playground, jobs and cover lookup                                                                                                           | M2; M3 for complete assistant journey                           |
| [M5 — Cutover](https://github.com/thijulio/thiago-smart-library/milestone/16)             | Accepted source-of-truth transition             | Approved freeze/final reconciliation, backup/restore and rollback boundary; writers switched; canonical marker and Sheet retirement accepted                                            | M3, M4; #10 and #11                                             |
| [Backlog](https://github.com/thijulio/thiago-smart-library/milestone/17)                  | Evidence-led expansion                          | Candidate scope only; promote after outcome/design/acceptance are agreed                                                                                                                | Relevant delivered workflow                                     |

Published Biome CSS supports the initial product. Cross-repository biome-vue
work remains visible on Libraries; it is a dependency only for slices requiring
those components, not a reason to copy tokens or block all delivery.

## Now — make the published foundation reproducible

- Integrate existing private-library changes, independent review and checks;
  record Git/CI and hosted release states. No repeat import is required.
- Verify identity/privacy across two users and document the Google onboarding
  gate. Publishing the OAuth audience is a separate hosted change.
- Reconcile #26 with prior private import acceptance. Do not close it from a
  count alone or rerun imports merely to update tracking.
- Move #27's remaining MCP work to M3. The abandoned spike is not marked passed.

## Next — make existing reading useful, then complete capture

1. **Reading workspace:** current reading and existing Up Next choices, linked
   details, with empty/unavailable data states. Read-only before queue editing.
2. **Reading memory:** existing #7 owns enrichment/import; valid recaps and
   quotes follow. Do not label disputed source links verified. Split dependent
   UI work when the data contract is ready.
3. **Expressed preferences:** #8 preserves comparison history and rankings;
   private Favorites/Stats follow its ready/stale contract.
4. **First capture:** create/update books, status and feedback under app-user
   ownership. This addresses empty libraries but waits for the authority
   decision below.

This is the recommended order inside existing milestone scope. Dependencies are
feature-specific: rankings need not gate every manual-capture design. Releases
before a whole milestone exits identify the accepted slice and remaining work.

## Authority decision before M2 writes

The current contract keeps production a read model and the Sheet canonical
until M5. Two paths require an explicit owner choice:

- **Recommended for review:** app-owned native libraries after a reviewed
  contract, with the founder's imported records read-only until M5. Define
  membership, stable identity, shared metadata versus private feedback,
  importer protection and recovery before enabling anything.
- **Existing conservative path:** all hosted library writes stay disabled until
  full parity, rehearsal and cutover authorize them. New-user validation is
  limited to browsing until then.

No pre-M5 native-writes exception is accepted here. Do not turn the proposal
into a global write flag or importer overwrite rule.

## Later — assistants and learning

Deliver scoped MCP reads, then confirmed writes once browser capture and the
writer contract are ready. Reuse existing product resources; measure transport,
cold start and failure behavior there. ChatGPT/Claude acceptance is separate
from Google sign-in success. No dedicated spike project/database is planned.

Discovery tickets preserve asynchronous enrichment (#14), multilingual retrieval
(#15), reviewable preferences (#16), portability (#17) and history/editions (#18).
Revisit stale provider/delivery assumptions before execution. Begin with one
evaluated assistance use case, not a general AI platform. Promotion out of
Backlog requires a deliberate priority decision; no provider, pricing or
embedding commitment is made here.

## Tracking rules

- Keep Todo / In Progress / Done. Todo does not mean authorized or unblocked;
  every issue names dependencies and its execution gate.
- Select one active delivery slice at session start. Do not invent due dates.
- Issues describe actionable implementation/fixes; product briefs and roadmap
  phases remain documents (Golden Path ADR 0007).
- Done requires evidence. Separate local implementation, review, Git/CI, merge,
  hosted operations and publication. A manual deploy does not mean merged.
- Implementation PRs run `pnpm check`; DB work also runs real-PostgreSQL tests;
  relevant UI/HTTP work runs `pnpm test:e2e`.
- Merges, deploys, hosted SQL/imports, Neon/Netlify changes and cutover require
  explicit owner approval. Planning tickets do not authorize those actions.
- Keep private records/credentials outside Git, prompts and logs. Leave the
  prototype repository, Sheet and site untouched.

See the [delivery queue](delivery-queue.md) for concrete issues and dependencies.

## Replacement checklist

Private Library/filters · detail with same-author books, series and quotes ·
Reading/Up Next · Stats · private Favorites ranking · Book Battle/undo · recap
reader · create/edit/archive/restore · Playground · community ratings and author
highlights jobs · cover lookup · MCP capture from ChatGPT/Claude · recovery and
explicit Sheet cutover.
