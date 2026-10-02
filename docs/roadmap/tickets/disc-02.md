# DISC-02 — Grounded asynchronous enrichment

**Phase:** Future discovery

**Tracking state:** ChatGPT-only product direction confirmed; design, eligibility and implementation pending

**Dependencies:** Core records and provenance; approved AI scope

**Source requirements:** [Product thesis](../../product/overview.md); Database specification §0, §10, §12.1 (`docs/database/spec.md`; pending DB-00 integration)

## Outcome and scope

Design reviewable explanations after explicit book/wishlist/feedback actions.

## Acceptance criteria

- [ ] Distinguish user records from generated analysis and name the records/sources used.
- [ ] AI failure never blocks recording the original action; define retry, staleness and review/discard behavior.
- [ ] Approve provider, data exposure and cost constraints before any model requests.

## Authorization and review gate

Discovery ticket only. A separately approved design and implementation scope are required before adding behavior, providers, authentication, vectors or paid calls.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.

## ChatGPT connection direction — 2026-10-02

The first grounded AI workflow will use the user's eligible, authorized ChatGPT connection. Product direction is confirmed; the workflow design and implementation remain pending. API-key fallback is outside scope.

- [ ] Require an inference-capable connection; disclose the relevant library context sent for each approved action.
- [ ] Keep user-authored records independent from generated output and retain source attribution.
- [ ] Define limited/expired/revoked/unavailable handling without losing the user's original action or silently changing credentials.
- [ ] Specify asynchronous consent and pending-job behavior on disconnect.
- [ ] Evaluate supported models/tools for this account-authorized route before choosing the first feature; do not assume ChatGPT history or memory is available.

Connection design depends on [DISC-01](https://github.com/thijulio/thiago-smart-library/issues/13). Official sources: [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
