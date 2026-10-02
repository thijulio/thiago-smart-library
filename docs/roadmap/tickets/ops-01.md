# OPS-01 — Hosted rehearsal and real-data validation

**Phase:** M7

**Tracking state:** Awaiting local prerequisites and environment authorization

**Dependencies:** DB-05 local acceptance

**Source requirements:** DB-05 Task 05.5 (`docs/database/plans/05-application-cutover.md`; pending DB-00 integration)

## Outcome and scope

Execute the existing hosted rehearsal contract only against explicitly named isolated targets.

## Acceptance criteria

- [ ] Record target identity, PostgreSQL version and whether the target is empty or cloned before mutation.
- [ ] Provision and verify approved least-privilege logins without exposing secrets.
- [ ] Owner reviews fresh authorized snapshot identity, dry-run issues and destructive deltas before apply.
- [ ] Apply core/enrichment/events, rebuild, verify and replay; complete backup/restore into a second approved target.
- [ ] Record preview and production separately; untrusted previews receive no real personal-data credentials.

## Authorization and review gate

Explicit approval must identify hosted targets, cloud/credential changes, real-data handling and each restore destination. Public-read publication is a separate gate.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.
