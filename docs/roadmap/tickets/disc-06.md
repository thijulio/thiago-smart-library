# DISC-06 — Reading history, editions and ownership extensions

**Phase:** Future discovery

**Tracking state:** Deferred; scope not approved

**Dependencies:** Approved product need

**Source requirements:** [Product thesis](../../product/overview.md); Database specification §0, §10, §12.1 (`docs/database/spec.md`; pending DB-00 integration)

## Outcome and scope

Decide whether rereading sessions, multiple editions/copies or multi-user ownership merit separate extensions.

## Acceptance criteria

- [ ] Document user scenarios before expanding the single-owner personal-record model.
- [ ] Preserve stable Book IDs and avoid inferred title/ISBN matching.
- [ ] Produce a scoped design and acceptance criteria only for extensions the owner chooses.

## Authorization and review gate

Discovery ticket only. A separately approved design and implementation scope are required before adding behavior, providers, authentication, vectors or paid calls.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.
