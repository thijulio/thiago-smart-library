# DISC-03 — Multilingual retrieval and embedding evaluation

**Phase:** Future discovery

**Tracking state:** Deferred; scope not approved

**Dependencies:** DB-03 provenance; separately approved retrieval scope

**Source requirements:** [Product thesis](../../product/overview.md); Database specification §0, §10, §12.1 (`docs/database/spec.md`; pending DB-00 integration)

## Outcome and scope

Evaluate lexical search before activating optional vectors and grounded retrieval.

## Acceptance criteria

- [ ] Define fixed PT/EN queries covering exact titles, aliases, paraphrases, spoilers and privacy filtering.
- [ ] Compare lexical, exact-vector and hybrid quality/latency/regeneration cost; historical text-embedding-3-small/1536 is a candidate, not activated behavior.
- [ ] Specify atomic generation lineage and stale-content exclusion; private text and vectors share access rules.
- [ ] Add indexes only when measured workload warrants them; approve provider calls and any vector migration separately.

## Authorization and review gate

Discovery ticket only. A separately approved design and implementation scope are required before adding behavior, providers, authentication, vectors or paid calls.

## Delivery rules

This ticket records planned work; creating it does not authorize implementation or external operations. Keep durable artifacts in English. Use Node 24 and pnpm 10.19.0, preserve Nx boundaries, consume published Biome packages, and keep `libs/ai` documentation-only during database delivery. Use synthetic fixtures; keep private exports, reports, credentials and backups outside Git. The live prototype and Sheet remain unchanged until explicit cutover.

Record implementation, verification, independent review, PR/CI, hosted rehearsal, deployment and cutover separately. Required local application gates are `pnpm check` and `pnpm test:e2e`; database implementation additionally requires the planned `pnpm test:db` once DB-01 supplies it. Revalidate Golden Path alignment on every delivery ticket; propose shared changes only for demonstrated reusable findings.
