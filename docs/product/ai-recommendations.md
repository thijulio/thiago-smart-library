# AI recommendations — discussion draft

Recorded: 2026-10-10. Status: **proposal for interactive product planning**.

The owner asked how AI could use their library for recommendations, including
whether retrieval-augmented generation (RAG) was needed. The approach below is
the assistant's recommendation, not an approved design or implementation scope.
It records the discussion without including private library records.

See the [product brief](overview.md), [current architecture](../architecture.md)
and [product decisions](decisions.md). Existing data/privacy contracts and
the Google Sheet's authority until M5 remain in force.

## Intended outcome

Help a reader choose what to read using their own history, reactions and current
intent. Explain recommendations with identifiable evidence, and let the reader
correct inferred preferences. Durable reading records remain useful without AI.

The owner confirmed that this broadly matches the product direction. The first
recommendation workflow, provider choices and delivery priority are still open.

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

## Suggested first experiment and open choices

The assistant recommends starting with **choosing from an existing wishlist**:
use reading evidence to suggest a short selection with inspectable reasons.
Discovering books outside the library additionally needs a reliable source of
candidate information. The owner has not selected between these workflows yet.

Evaluate retrieval completeness, whether explanations match their cited records,
whether the reader finds the choices useful, and whether feedback corrects future
choices. Compare against a simple wishlist/filter baseline. Include isolation
checks before any multiuser AI release; grounded explanations alone do not prove
recommendation quality. Numeric targets remain undecided.

Provider/channel selection, eligible evidence, profile persistence, candidate
sources, model/embedding costs, consent and milestone sequencing remain open.
No new delivery tickets or accepted decisions are created by this draft.

## Technical references

- [Retrieval documentation](https://developers.openai.com/api/docs/guides/retrieval):
  semantic search, attribute filters and hybrid semantic/keyword ranking.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture):
  tools/resources provide context; the protocol does not dictate model behavior.

References consulted on 2026-10-10; these explain mechanisms, not a vendor choice.
