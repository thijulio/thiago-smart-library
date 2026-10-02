# OPS-02 — Canonical cutover and rollback acceptance

**Phase:** M8

**Tracking state:** Awaiting rehearsal and explicit cutover authorization

**Dependencies:** OPS-01; owner acceptance of usable workflow

**Source requirements:** DB-05 Task 05.6 and rollback matrix (`docs/database/plans/05-application-cutover.md`; pending DB-00 integration)

## Outcome and scope

Prepare and execute the specified final export, writer freeze, canonical marker and recovery boundary.

## Acceptance criteria

- [ ] Accept the available owner workflow; if private browser parity is required, stop at rehearsal until that separate scope is delivered.
- [ ] Record final source hash, freeze boundary, verification and successful restore evidence.
- [ ] Obtain explicit approval for production import, writer changes, deployment/publication and canonical ownership switch.
- [ ] Exercise rollback steps and prevent simultaneous canonical writers.
- [ ] Record the canonical marker and owner acceptance; merging code or connecting a database alone does not complete cutover.

## Authorization and review gate

Separate explicit approval is required for production operations and the canonical switch; Sheet retirement is not implied by ticket creation.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.
