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
4. **Display the next three books per platform.** Consider recent reading, series
   continuity and balancing a dense book with a lighter next read. Use Jev for
   the contextual judgments rather than sorting only by general taste relevance.
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

Proposed flow: request → retrieve private evidence → compare eligible candidates
→ recommend with reasons → capture feedback.

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
milestone sequencing remain open. In particular, decide whether each platform's
three books are alternatives for the immediate next read or an ordered sequence
whose context changes after each proposed book.
No new delivery tickets or accepted decisions are created by this draft.

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
