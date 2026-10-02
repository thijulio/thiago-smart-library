# DISC-01 — Private browser workflows and authentication scope

**Phase:** Future discovery

**Tracking state:** ChatGPT-only product direction confirmed; design, eligibility and implementation pending

**Dependencies:** DB-05 owner workflow; owner decision

**Source requirements:** [Product thesis](../../product/overview.md); Database specification §0, §10, §12.1 (`docs/database/spec.md`; pending DB-00 integration)

## Outcome and scope

Define wishlist capture, book feedback, private editing, access control and any prototype parity required before cutover.

## Acceptance criteria

- [ ] Approve the first browser workflow, private field exposure rules and authentication design.
- [ ] Recording a wishlist item or completion/feedback works when AI is unavailable.
- [ ] Define permissions, validation, recovery and acceptance tests before creating implementation tickets.

## Authorization and review gate

Discovery ticket only. A separately approved design and implementation scope are required before adding behavior, providers, authentication, vectors or paid calls.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.

## ChatGPT connection direction — 2026-10-02

ChatGPT is the only planned AI connection. Use the user's authorized ChatGPT account; do not add API-key BYOK or another provider as a fallback. Product direction is confirmed; authentication design, hosted eligibility and implementation remain pending.

- [ ] Verify the named hosted app is eligible for the official Sign in with ChatGPT / plan-usage integration; OSS/local availability alone is insufficient.
- [ ] Distinguish app sessions, verified identity, authorized inference and available usage; successful login alone does not enable AI.
- [ ] Define consent, protected tokens, refresh/revocation, account isolation, cancellation, reconnect and disconnect.
- [ ] Preserve library records after disconnect and keep record capture usable without AI.
- [ ] Do not imply imported ChatGPT conversations or memory, unlimited usage, or automatic paid fallback.

Official sources: [website sign-in](https://developers.openai.com/siwc/website), [hosted eligibility and plan usage](https://developers.openai.com/siwc/token-sharing-open-source).
