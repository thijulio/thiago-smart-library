# Product overview

> 2026-10-10: the owner reopened product definition for interactive brainstorming.
> Treat this document as working material. Proposed priorities and exceptions
> are not approved implementation scope; current data/privacy contracts remain in force.

Planning review: 2026-10-10. This brief recovers existing intent; new priorities
and validation proposals remain proposals until reviewed. See the
[source review](direction-and-evidence.md), [benchmark](benchmark-2026-10-10.md),
[decisions](decisions.md) and [roadmap](../roadmap/README.md).

## Purpose and users

Smart Library is a private, durable memory of a person's reading life: books,
reading activity, notes, reactions and evolving preferences. It should help a
reader choose what to read and remember why previous reading mattered, without
depending on a chat application's memory to retain those records.

The product is for any user. Google is the first login provider; application
user IDs own libraries independently of login providers. Initially only the
founder's imported library is populated. New users start with empty private
libraries. Anonymous visitors see product information, not another user's books.

The founder is the first design partner. The proposed next audience is readers
who already keep reading lists and reactions across several tools or formats.
That audience is a hypothesis, not an established customer segment.

Proposed promise: **keep your reading history and reactions in one private place,
then use that evidence to choose your next book and revisit what you learned.**

AI and MCP alone are not differentiation. Existing products offer tracking,
recommendations, notes and assistant connections. Our hypothesis is that a
coherent book-level record linking reading, feedback, recaps and reviewable
preferences is useful enough to become a reader's regular workspace. The
benchmark establishes overlap; it does not prove an unserved market.

## The reading loop

| Moment          | User outcome                                                       | Delivery boundary                                                                        |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Capture         | Save a book or wishlist item without losing the original intent    | Browser writes need the approved multiuser write contract; MCP follows the same rules    |
| Choose and read | See current reading and a deliberate Up Next list                  | Start with existing records; AI recommendations are optional                             |
| Reflect         | Finish a book and preserve feedback, notes and optional recap      | User feedback and generated analysis have separate authorship and provenance             |
| Revisit         | Find a previous reaction, quote or recap and understand its source | Missing or disputed enrichment stays visibly missing or under review                     |
| Learn           | Inspect a suggested preference or next-book explanation            | An evaluated AI slice follows durable capture; inferences are not automatically accepted |

These are product outcomes, not claims that every step is implemented today.

## Principles recovered from previous discussions

1. User records survive AI outages, disconnection and provider changes.
2. Saving a book or feedback succeeds independently of later enrichment.
3. Generated analysis identifies the records or external sources used.
4. User statements remain distinguishable from generated content and inferred preferences.
5. Users can inspect, correct or reject inferred preferences.
6. Build small useful slices; do not assume RAG, training or autonomous agents are necessary.
7. Libraries and assistant access are scoped to the authenticated application user.

## Current baseline and limits

The 2026-10-09 hosted handoff records a product page, Google login and a private
library with search, status filters and detail. The founder confirmed access.
Local integration tests cover signed sessions and user isolation; a hosted
second-account exercise is pending. Google OAuth remains in Testing with only
the owner admitted. Multiuser architecture is not the same as open onboarding.

The first publication was manual and preceded Git integration. Issue #28
tracks review, Git integration and release evidence for the reproducible baseline.
Creation/editing, a reading workspace, recap browsing, rankings and assistant
tools are not delivered. A new user cannot yet complete the capture loop.

The Google Sheet remains canonical for the imported library until M5. Native
libraries need an explicit authority/reconciliation contract before writes are
enabled. The database contract and execution addendum remain authoritative.

## Delivery choices

| Approach                                      | Benefit                                                                                  | Tradeoff                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Reading memory in useful slices — recommended | Preserves the original intent and makes each milestone observable in a reader's workflow | Requires careful sequencing of writes and imported-record authority               |
| Complete prototype parity first               | Keeps the replacement contract simple and preserves existing workflows                   | Delays a usable empty-library experience and tests demand late                    |
| Lead with recommendations/chat                | Demonstrates an AI experience early                                                      | Competes with established products before durable capture and evaluation evidence |

The recommendation changes emphasis, not the accepted cutover gate: full
prototype parity and Sheet retirement remain required by T-02. Relaxing parity
or enabling native production writes before M5 requires a new owner decision
and data-contract review.

## Evidence to collect

Proposed evaluation: a small invited pilot once users can populate their own
libraries. Recruitment and invitations are owner actions; no messages are sent
by this planning work. Pricing and business model remain undecided.

- Can a new reader sign in, add a book and find it again without help?
- Can a returning reader choose a next book and retrieve a saved reaction?
- Do readers return to perform another meaningful reading action?
- Can a reader understand and reject an AI explanation without losing a record?

Record task outcomes and participant denominators, not just page views or total
imported books. The founder's usage alone does not establish retention or demand.
Choose numeric targets after the first observed baseline. Collect minimal,
consented evidence; private prose and titles do not belong in analytics logs.

## Deferred expansion

Social feeds, public libraries, clubs, lending, billing, extra login providers,
embeddings and autonomous agents are not requirements for the next slice.
Existing discovery tickets preserve enrichment, retrieval, preferences,
portability and reading-history questions. MCP is a planned capture/access
channel, not a prerequisite for ordinary browser use.
