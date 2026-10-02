# GOV-01 — Qualify the published governance pilot in Smart Library

**Phase:** Parallel track

**Tracking state:** Blocked pending publication validation

**Dependencies:** Genuinely published and validated governance-core 0.1.0

**Source requirements:** [Consumer governance boundary](../../governance-pilot.md); Historical foundation PR plan (private historical provenance)

## Outcome and scope

Resolve remaining foundation governance acceptance LIB-09–LIB-11 only after validating the immutable upstream publication. Upstream implementation or historical tests do not prove publication.

## Acceptance criteria

- [ ] Verify real package availability, downloaded contents, version identity and supported-host qualification before installation.
- [ ] Exact consumer installation/removal preserves policy and app files.
- [ ] Passing and controlled failing review cases are reproducible; stale head/policy evidence fails validation.
- [ ] Supported host enforces read-only review and caller-controlled release authority.

## Authorization and review gate

Do not install or pin before publication validation. Installation/host registration and external publication require their applicable separate authorization.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.
