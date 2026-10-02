# Product overview

Direction captured through 2026-10-02. Product intent is documented here; delivery evidence belongs in the roadmap and ticket handoffs.

## Purpose

Thiago Smart Library should provide a durable, private record of books, reading activity, notes, opinions and evolving preferences. Its library records supply useful context for grounded assistance while remaining usable independently from AI.

The existing Thiago Library prototype remains active, with its Google Sheet authoritative until a separately approved cutover. Smart Library's current database delivery is a bounded single-owner application, not a general catalogue or multi-user platform.

## Product principles

- User records survive AI outages, disconnection and provider changes.
- User-authored content and generated or inferred content remain distinguishable.
- AI explanations identify the library records or sources used where possible.
- Users can review generated analysis and inferred preferences before treating them as personal truth.
- Enrichment follows explicit actions and never blocks recording the original action.
- Delivery proceeds in small, verifiable slices with separate review and operational gates.

## Confirmed AI direction

The intended experience is [Connect with ChatGPT](chatgpt-connection.md): the user authorizes their ChatGPT account for eligible AI actions inside Smart Library. ChatGPT is the only planned connection for now. An API-key input or BYOK fallback is outside this direction.

This is confirmed intent, not a working integration. Hosted eligibility, application authentication and the first AI workflow remain pending. Connection does not import existing ChatGPT conversations or memory.

## Scope and status

The existing foundation and connectivity baseline precede the staged relational database work. Product schema, incremental import, enrichment, immutable comparisons, coherent rankings, owner operations and recovery are tracked by the [delivery roadmap](../roadmap/README.md).

Private browser editing and AI capabilities need approved designs before implementation. Multi-user tenancy, edition/copy matching, rereading sessions, autonomous orchestration, object storage and model training are not inferred requirements. Optional extensions remain discovery candidates until selected.

Use [user experience](user-experience.md) for journey requirements and [decisions](decisions.md) for choices and unresolved questions. The product thesis and historical workbook studies remain private provenance; no private records are reproduced here.
