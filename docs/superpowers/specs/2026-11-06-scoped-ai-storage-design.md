# Scoped AI results and reading-plan storage — issue #50

Status: proposed technical design for owner review. This document does not
amend the binding database contract, approve production writes or complete #50.
Implementation planning follows review of this proposal.

## Goal and baseline

Persist reusable enrichment, personal judgments, independent platform plans and
deferral reasons with ownership, provenance and recoverable revisions. Opening a
page reads saved results; it must never calculate AI results as a read side effect.

The inspected baseline is main `550b4da`, including delivered Reading #45 through
[PR #58](https://github.com/thijulio/thiago-smart-library/pull/58). Migrations
0001–0007 exist. Migration 0006 introduced exclusive book/library membership and
session-scoped reads. Imported assessments, feedback and explicit Up Next fields
already exist; they are not writable app-owned result slots.

Requirements: [issue #50](https://github.com/thijulio/thiago-smart-library/issues/50),
[product discussion](../../product/ai-recommendations.md),
[decisions](../../product/decisions.md), [architecture](../../architecture.md),
[database contract](../../database/spec.md) and its
[execution addendum](../../database/plans/execution-contracts.md).

## Approaches and recommendation

1. **Separate app-owned revision stores — recommended.** Retain imported records
   and their provenance; add typed result, plan, preference and deferral stores.
   This permits recovery and source comparison without giving runtime access to
   imported writer routines. It adds explicit joins and freshness tracking.
2. **Extend imported assessment and queue fields.** Fewer new tables, but mixed
   authorship and import replacement would require redesigning existing field
   authority and rollback. This conflicts with preserving Sheet-owned inputs.
3. **One generic JSON document per user.** Simple initial persistence, but weak
   relational ownership, cross-book constraints and independent platform updates.
   It shifts too much correctness into every caller.

The recommendation is an implementation proposal, not an owner-selected change
to the production authority rules. Existing Nuxt, PostgreSQL and framework-free
domain DTOs remain; no new provider, framework or deployment resource is needed.

## Proposed authority contract

| Record                                                                              | Authority before M5               | Rule for this slice                                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Imported book facts, status, completion, feedback, assessments and explicit Up Next | Existing Sheet/import contract    | Read as inputs; never overwrite or silently reinterpret as app results.                                    |
| New derived enrichment, taste and format judgments                                  | App-owned, private to the library | Separate versioned records; new imports cannot replace or delete them. Changed inputs can make them stale. |
| Generated Kindle/Audible plans                                                      | App-owned derived results         | Independent revision heads; never write `books.next_rank`, `next_slot` or `why_next`.                      |
| Explicit app preference and scheduling intent                                       | Authenticated user                | Preserve separately from inferred preferences, feedback and generated reasons.                             |
| Native book creation, status/completion or feedback edits                           | Not enabled by #50                | #46 requires its reviewed write/authority contract and a separate production decision.                     |

For imported books, this slice's status/completion policy is conservative: the
app does not write these values or create an authoritative status overlay.
Reading continues to show the existing source-backed projection. App actions
stored here are preference/deferral intent only; they do not mark a book bought,
started or finished. There is no dual writer or automatic Sheet synchronization.

Native libraries can receive the persistence structure and return honest empty
results, but #50 does not enable book creation. An owner decision enabling native
or imported reading-state writes before M5 must name its reconciliation and
recovery contract rather than treating this schema as a blanket exception.

## Storage model

All names below are proposed. Use additive migrations after rechecking the next
free number at implementation time; never change migrations 0001–0007.

- **Result streams and immutable revisions.** A stream belongs to a library,
  book and kind (`enrichment`, `taste`, `format`). A locked head identifies its
  accepted revision. Each revision records a schema version, typed validated
  payload, dependency manifest/hash, model/provider identifier, rubric/prompt
  versions, producer identity, calculation time and source references. Separate
  kinds use separate payload validators, not an unconstrained JSON write API.
- **Preference evidence.** Explicit statements and inferred preferences are
  distinguishable records with supporting references. Only a user action can
  accept/reject an inference. A worker cannot label an inference user-authored.
  This slice stores supplied evidence; inference generation/UI belong later.
- **Platform plan streams and revisions.** One head per library/platform (Kindle
  or Audible), ordered entries referencing owned books and relevant judgment
  revisions, dependency manifest, calculation metadata and scheduling explanations.
  Positions are unique positive contiguous integers within a revision; books
  cannot repeat. An empty accepted plan is distinct from no saved plan. Store
  the full ordered revision; a later UI can display its first three entries.
- **Deferral intent.** Append a user-authored reason linked to library, book and
  platform, expected plan revision and request identity. Preserve history and
  explicit cancellation/supersession. A deferral does not lower taste relevance
  or become a permanent dislike. #54 defines the action UI and placement policy.
- **Operation receipts.** Bind retry keys to actor, operation and canonical
  request digest with the committed revision/result. Receipts are private and
  contain no credential or provider token material.

Enforce library/book membership with composite relational constraints where
possible and recheck active ownership inside each routine. A result identifier,
plan entry, source reference or dependency must not join another library's
private data. Archived books remain in historical revisions but are excluded
from current projections; never cascade away historical evidence on archive.
Descriptive enrichment is reusable within its library. Cross-user sharing is
deliberately deferred: descriptions can derive from private sources.

## Writes, replay and concurrency

Use narrow routines with typed operation names and bounded payloads. Reuse the
existing session ownership boundary: HTTP actors come only from verified,
persisted sessions; request-supplied actor/library IDs cannot select a principal.
As in current scoped reads, the SQL actor parameter is supplied by a trusted
server, not an untrusted browser connection. Database grants do not authenticate
an application user by themselves.

User-intent routines and derived-publication routines have distinct grants.
Runtime receives only the exact user/read executions needed by the accepted
slice. A separate NOLOGIN producer permission group can publish derived results
through scoped routines, but cannot write user feedback, explicit preferences,
imported tables or ownership. No producer login or hosted credential is created
by this design. Do not grant existing broad editor/importer capabilities.
Every security-definer routine fixes its search path, qualifies objects and
revokes PUBLIC execution. Runtime/producer get no direct base-table access.

A write validates authorization before looking up its operation receipt. A
matching completed request returns the same receipt/revision without creating a
duplicate, even if its expected head has since advanced. Reusing a key for a
different request fails. Scope keys by authenticated actor and operation.

For a new request, lock the affected stream, compare the expected head revision
(including explicit absence on first creation), and validate the dependency
manifest before atomically appending a revision, moving the head and storing its
receipt. Competing changes return a typed conflict with no partial writes.
Unique request receipts and stream identities must serialize first-write races.
No database transaction remains open during a model/network call.

Coordinate dependency validation and head publication with the execution
addendum's shared writer/import gate and lock ordering. A stream lock alone does
not protect mutable inputs: concurrent preference, ownership or import changes
must either serialize with publication or force its validation to retry. The
implementation plan must specify that transaction protocol and exercise these
interleavings with real PostgreSQL tests.

A late calculation must not supersede a newer plan or changed input, even when
its payload is valid. Server-controlled producer metadata cannot be supplied by
an ordinary user-intent request. Reject foreign references and oversized or
malformed payloads before publishing any head.

## Freshness and recovery

Define a canonical, versioned dependency manifest per result kind. It names the
owned source fields and their provenance/revisions, preference evidence, relevant
result revisions and rubric/model versions. Hash logical input values using a
documented encoding; changing an unrelated field must not invalidate all work.
Derived freshness is determined against current authorized inputs, not trusted
from a caller's `fresh` flag or calculation timestamp.

Each DTO returns `missing`, `fresh`, `stale` or `unavailable` explicitly. Stale
accepted output may be shown as stale; unavailable reads are not empty results.
Provider failure never deletes the last accepted revision or converts it to a
successful empty result. Page reads perform no model calls or writes.

Kindle sequence manifests use Kindle reading/plan context; Audible manifests use
Audible context. Shared taste inputs can affect both, while a platform-only
deferral does not invalidate the other's sequence. Intended future reads never
become completed events or evidence of enjoyment.

Recovery republishes a retained payload as a new audited revision using current
head and input checks. It never edits history or moves a head backward blindly;
output based on obsolete inputs remains explicitly stale. Existing imported
values/provenance remain byte-for-byte unchanged by app-result operations.

## API and implementation boundaries

Add framework-free DTOs/validation in `libs/domain`, migrations and synthetic
tests under `libs/database`, and session-scoped read adapters under the existing
Nitro server boundary. Preserve the current Nx dependency direction; HTTP code
does not import offline database/importer tooling.

This slice defines and tests persistence operations without exposing a generic
browser AI-result write endpoint. User action routes/UI are delivered under
#46/#54; worker orchestration/provider calls under #51/#14/#16/#52/#53. No worker
is scheduled, production writer enabled, or new model credential requested here.
Existing Reading remains explicit/source-backed rather than mixing plans into
its Up Next groups. All private responses stay no-store and sanitized.

## Acceptance and delivery

Synthetic real-PostgreSQL tests must cover:

- Two libraries, missing/archived/foreign books, forged HTTP actors, foreign
  dependency/preference references, PUBLIC denial and direct-table denial.
- Strict payload versions, invalid/duplicate/gapped plan positions, unknown
  evidence and explicit/inferred authorship privileges.
- First-write races, concurrent head conflicts, exact replay, changed-payload
  retry rejection, atomic rollback and late result rejection.
- Input changes making only affected results stale; independent platform context;
  no writes/model calls on reads; honest missing/empty/stale/unavailable states.
- Retained revision recovery and failed producer operations preserving accepted
  output. Replaying an import must leave app revisions/heads/receipts intact;
  imported field values and provenance must stay unchanged by app operations.

Run `pnpm check`, `pnpm test:db` and relevant `pnpm test:e2e` under Node 24 and
Corepack/pnpm 10.19.0. Use only disposable loopback PostgreSQL and synthetic data.
Do not report blocked commands or source inspection as runtime acceptance.

After design approval, amend the binding database contract/execution addendum
with the accepted authority and invariants, then write the implementation plan.
Merges and hosted migration/deployment require concrete approval. Before hosted
app-owned writes, identify the existing target, exact grants, backup/export and
recovery preserving new revisions; the unchanged Sheet alone cannot recover
app-only outputs. Issue #44 remains the hosted multiuser acceptance gate.

## Decisions presented for review

The proposed defaults are separate private revision stores; no imported
status/completion overlay; no native book-write enablement; private per-library
enrichment; independent platform plan heads; retained immutable revisions; and
no provider calls or production writer activation in #50. These are author
recommendations for review, not newly accepted product decisions.

## Design review evidence

An independent read-only builder review found no important unanswered question
preventing implementation planning. Concrete SQL lock acquisition, canonical
manifest encodings, payload limits and DTO signatures remain implementation-plan
details under the invariants above. This is design review evidence, not proof
that persistence or runtime behavior has been implemented or tested.
