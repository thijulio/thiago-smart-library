# Intended user experience

These are intended journeys, not claims that the current application implements them. The [roadmap](../roadmap/README.md) records delivery order; implementation tickets carry acceptance evidence.

## Record a book or wishlist item

The owner records a book or wishlist item and can later correct its information without changing its stable identity. Recording succeeds without an AI connection. A later AI action may explain relevance using approved library context; the explanation remains distinguishable from the owner's record.

The initial database adoption provides an owner CLI. A browser editor, login flow and any required prototype parity are separate design work tracked in [DISC-01](https://github.com/thijulio/thiago-smart-library/issues/13).

## Record completion and feedback

The owner records completion information and personal feedback. Sparse or partial dates remain truthful; the system does not invent a precise date. Notes and opinions remain private. AI unavailability cannot undo or prevent recording feedback.

A future, separately designed enrichment workflow may use feedback to propose a reviewable preference inference. The user should be able to distinguish the inference from their explicit statements. [DISC-02](https://github.com/thijulio/thiago-smart-library/issues/14) and [DISC-04](https://github.com/thijulio/thiago-smart-library/issues/16) track these designs.

## Connect ChatGPT and request assistance

The user obtains an application session, chooses the ChatGPT connection action, consents with OpenAI and uses an approved AI feature when eligible. The application distinguishes identity, authorization to use AI and actual inference availability.

The user sees which library context an action needs. Retained results identify their source records and remain distinguishable from user-authored content. See the [connection specification](chatgpt-connection.md) for the detailed journey, failure states and hosted eligibility gate.

## Disconnect or encounter an AI failure

Disconnect prevents new requests through that connection while preserving library records and retained results. Cancelled consent, expired/revoked access, usage limits and provider unavailability leave the original action intact. Reconnect behavior and pending asynchronous jobs need explicit design before implementation. There is no silent API-key or platform-funded fallback.

## Transition from the prototype

Controlled imports preserve stable Book IDs and original source evidence. Repeated imports do not duplicate records; newer source information must not overwrite native edits silently. The live Sheet remains authoritative until the owner accepts the available workflow and an explicitly approved cutover completes.

Private browser parity is not assumed delivered by the owner CLI. If it is required before transition, retain the Sheet as canonical while that separate scope is delivered. [DB-05](https://github.com/thijulio/thiago-smart-library/issues/9), [OPS-01](https://github.com/thijulio/thiago-smart-library/issues/10) and [OPS-02](https://github.com/thijulio/thiago-smart-library/issues/11) track local adoption, hosted rehearsal and cutover separately.
