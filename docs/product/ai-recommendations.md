# AI recommendations — discussion draft

Recorded: 2026-10-10. Status: **proposal for interactive product planning**.

The owner asked how AI could use their library for recommendations, including
whether retrieval-augmented generation (RAG) was needed. The owner subsequently
identified the highest-value workflows and selected Jev as the intended decision
model to explore. This draft separates those stated priorities from proposed
implementation details. It is not an approved technical design or permission for
hosted execution, and contains no private library records.

See the [product brief](overview.md), [current architecture](../architecture.md)
and [product decisions](decisions.md). Existing data/privacy contracts and
the Google Sheet's authority until M5 remain in force.

## Intended outcome

Help a reader choose what to read using their own history, reactions and current
intent. Explain recommendations with identifiable evidence, and let the reader
correct inferred preferences. Durable reading records remain useful without AI.

The owner confirmed that this broadly matches the product direction and supplied
the priorities below. Their technical design and delivery sequence remain open.

## Owner-stated priorities

1. **Display current reading.** Make active reading visible in the product.
2. **Calculate taste relevance for each book using Jev.** Estimate how well a
   book fits the reader's preferences.
3. **Choose a wishlist book's best platform/format using Jev.** Compare Kindle
   versus audiobook with parameters such as complexity, suitability for listening
   and quality. The complete criteria and weights still need discussion.
4. **Display the next three books in a planned reading order per platform.**
   The owner clarified that this is an ordered plan to consult when deciding the
   next read. Consider recent reading, series continuity and balancing a dense
   book with a lighter next read. Let the reader move a book further down the
   list, add a reason and have Jev reassess its placement. Use Jev for contextual
   judgments rather than sorting only by general taste relevance.
5. **Then add filtering by story characteristics.** Use an inexpensive generative
   model to enrich book records with useful descriptive tags, and Jev to evaluate
   their relevance to a natural-language query. One supplied query describes a
   group stealing from the rich led by a skilled con artist; broad genre labels
   alone may not preserve enough detail to match that request.

The site's organization should draw on the Thiago Library prototype. Its source
defines Library, Reading, Stats and Favorites navigation. Familiar reading and
browsing workflows are the reference; a chat interface is not the requested
primary organization. Prototype parity and these new AI priorities still need
to be reconciled in the roadmap.

The owner identified **Jev by TypeSafe AI** and reported having Vercel credits.
Account access, credit eligibility for AI Gateway and usable balance have not
been verified. No credentials have been requested or model calls made.

## Owner-stated calculation lifecycle

Calculate with Jev, persist the results and reuse them when displaying the
product. Refresh affected results on meaningful events such as buying a book,
adding a recommendation or finishing a book. Opening a page should read saved
results rather than invoke Jev again. The inexpensive enrichment model should
also produce reusable stored output.

The following trigger mapping is proposed implementation detail:

| Event                                          | Refresh scope                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Add a new book or recommendation               | Enrich missing book information; calculate its taste and format judgments; update eligible platform queues                        |
| Buy a book already evaluated                   | Update ownership, edition availability and eligibility in code; refresh qualitative format judgments only if their inputs changed |
| Finish a book                                  | Update status, recent-reading context and series progress; refresh affected next-read judgments and queues                        |
| Move a planned book later and add a reason     | Persist the reader's scheduling decision and reason; reassess placement in the affected platform plan using that reason           |
| Add or change a rating, reaction or preference | Refresh the relevant preference evidence and dependent taste/format judgments, then queues                                        |
| Correct book metadata or an edition            | Refresh only judgments depending on those changed facts                                                                           |
| Change ranking criteria or request a refresh   | Recompute affected judgments against the current criteria                                                                         |

Finishing a book supplies reading context; it does not by itself prove the reader
liked it or justify changing a taste preference. Adding a candidate should not
force reevaluating every unchanged book. Exact sorting and eligibility updates
can often reuse existing judgments without a model call.

Proposed persisted outputs include book enrichment, user-specific taste scores,
format judgments and platform recommendations. Retain calculation time, source
references and input/model/rubric versions so stale results can be detected and
only their dependents refreshed. Keep all personal outputs scoped to their owner.
Background refresh, coalescing nearby changes and failure handling remain design
choices; saving a reading action must not wait for AI to succeed.

Natural-language filtering depends on the actual query: a new query may need a
new Jev evaluation. Reuse a saved query result while its query, book evidence and
any included user preferences remain unchanged. Saved book tags alone do not
precompute every possible query match.

## Planned reading order and reader feedback

Each platform has a saved reading plan; the next three entries are its visible
near-term order. Reordering must consider the sequence, not merely rank three
independent alternatives against the same current state. The owner wants to
consult this plan when deciding what to read next.

Proposed interaction: select **Move later**, enter a reason, save the decision,
then refresh the affected plan and store the resulting placement. Jev evaluates
the relevant qualitative factors; application code applies eligibility and
series constraints and calculates the resulting positions. The user's explicit
request to defer the book must survive the refresh rather than being immediately
undone by its existing high taste score.

A reason such as "too dense right now" is scheduling context, not automatically
a lower taste score or a permanent preference against dense books. Explicit
dislike or a corrected preference may have different effects, but those effects
need defined rules and reviewable evidence.

For later positions, use the characteristics of preceding planned books as
anticipated context. Do not treat a future read as completed or invent the
reader's reaction to it. Finishing a real book, recording actual feedback or
deferring an entry can update the remaining plan. The persistence lifecycle
above applies: displaying the plan reads stored results.

## Proposed separation of judgments

Keep three distinct outputs rather than folding every decision into one score:

| Output                          | Question                                  | Proposed inputs                                                                          |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Taste relevance                 | How well does this book fit this reader?  | Reviewable preferences, reading feedback and book characteristics                        |
| Format suitability              | Which available edition/format fits best? | Complexity, listening suitability, edition-specific audio quality and reader preferences |
| Read-next priority per platform | What should come next in this queue?      | Taste and format fit, recent reading, density contrast and series order                  |

These inputs and the combination formula are proposals. Edition availability,
read/unread status, series prerequisites and exact calculations belong in code.
Jev can evaluate individual qualitative factors against explicit rubrics; code
then combines them into platform-specific queues. Do not treat model confidence
as a measured probability that the reader will enjoy a book.

Missing narrator/edition evidence must remain unknown rather than becoming an
invented audio-quality judgment. Store descriptive book attributes separately
from user-specific preferences and recommendations. Preserve the original
description and provenance alongside generated tags; tags should not be the only
evidence available to evaluate a nuanced story query.

## Verified Jev capabilities and proposed integration

TypeSafe documents three primitives: Choice selects an option, Score evaluates
an ordered rubric, and Noul estimates whether a statement is true. Jev returns
typed decisions rather than generating explanatory prose. TypeSafe recommends
decomposing judgments into focused questions and composing the results in code.

Vercel documents Jev through AI Gateway, including HTTP and TypeSafe-compatible
access. A server-side HTTP integration is a candidate for the existing Nitro
application on Netlify; using the gateway does not require moving the product's
hosting. Credential configuration, billing and data handling remain design work.

Proposed roles: an inexpensive generative model produces source-backed book
descriptions/tags; Jev evaluates taste, format, reading context and query match;
ordinary application code enforces ownership, eligibility, arithmetic and sorting.
Human-readable explanations need templates or a separate generative step. No
specific tagging model, pricing target, scoring scale or thresholds are selected.

## Proposed approach

RAG retrieves relevant information and provides it as context for generation.
Vector search is one possible retrieval method; structured database queries can
also supply context. Retrieval alone does not define a recommendation system:
candidate selection, preference handling, comparison and evaluation also matter.

1. **Retrieve reading evidence.** Use authenticated, user-scoped queries for
   books, reading history, ratings, notes, comparisons and wishlist records as
   these become available under the approved data contract. Exact facts and
   filters come from structured queries. Do not assume these features are all
   implemented or all imported today.
2. **Build a reviewable taste profile.** Keep explicit preferences distinct from
   inferred patterns. Link inferences to supporting records and permit correction
   or rejection. Deriving broad preferences requires examining the relevant
   reading history, not only a few semantically similar excerpts.
3. **Compare candidates and explain choices.** Apply eligibility constraints,
   compare candidates against preferences and the current request, then explain
   recommendations with evidence. Missing facts remain missing; a plausible
   explanation is not proof that a recommendation is useful.
4. **Use feedback to improve future choices.** Preserve user reactions separately
   from generated explanations. Rejected recommendations can reveal a wrong
   inference or a temporary reading preference rather than a permanent dislike.

Proposed calculation flow: meaningful event → retrieve affected private evidence
→ evaluate changed judgments → store results → update platform queues.
Proposed display flow: read persisted results → show recommendations and reasons
→ capture the next reading action or feedback.

## When semantic retrieval helps

Semantic search could find relevant passages in longer notes or recaps when the
reader uses different words. Hybrid retrieval combines semantic and keyword
search. Introduce embeddings only when representative questions demonstrate a
useful improvement over structured and ordinary text retrieval.

This proposal does not require model training, a separate database, a new Neon
project or copying the library into another hosted service. Embedding storage,
index updates, provider data handling and costs need a concrete design if this
step is selected.

## MCP and the application

MCP is a planned channel through which assistants access authorized library
tools. It does not replace retrieval or recommendation logic. The proposed
library operations should enforce ownership on the server before returning
context, whether invoked through MCP or an eventual in-app AI experience.

Only the authorized user's relevant records should be eligible for AI context.
The AI integration's consent, provider data handling and retention need review
before any private records are sent. This planning work sends no library records
to a model and changes no hosted resources.

## Evaluation and open choices

The working product slice is now current reading plus personal relevance, format
choice and three next books per platform, with story filtering afterwards. This
replaces the assistant's earlier generic wishlist-first experiment suggestion.
Milestone sequencing and executable tickets still need joint planning.

Evaluate retrieval completeness, whether explanations match their cited records,
whether the reader finds the choices useful, and whether feedback corrects future
choices. Compare against a simple wishlist/filter baseline. Include isolation
checks before any multiuser AI release; grounded explanations alone do not prove
recommendation quality. Numeric targets remain undecided.

The initial taste evidence, relevance rubric, format criteria, queue behavior,
profile persistence, enrichment sources, model/embedding costs, consent and
milestone sequencing remain open. The owner selected a planned reading order
per platform and reason-based deferral. The plan horizon, how cross-platform
recent reading influences each queue, how long a deferral reason applies and the
exact placement rules still need design. No new delivery tickets or technical
design approvals are created by this draft.

## Technical references

- [Retrieval documentation](https://developers.openai.com/api/docs/guides/retrieval):
  semantic search, attribute filters and hybrid semantic/keyword ranking.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture):
  tools/resources provide context; the protocol does not dictate model behavior.
- [TypeSafe introduction](https://docs.typesafe.ai/introduction) and
  [primitives](https://docs.typesafe.ai/primitives): typed decisions and composing
  focused questions in code.
- [Vercel Jev integrations](https://vercel.com/i/jev-integrations): AI Gateway
  HTTP, TypeSafe-compatible and SDK access paths.

References consulted on 2026-10-10; these explain mechanisms, not a vendor choice.
