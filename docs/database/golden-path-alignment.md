# Golden Path alignment — DB-00

Observed 2026-10-02 against freshly fetched Golden Path `origin/main`
`a8a822b10ccdb736683d92f93a7711afce042e4f`, its AGENTS, tech radar, and ADRs 0001–0004.
Application baseline: `3841213f6db5ee8bf98620094e2a2ac10881b8ac`.
Golden Path `memory.md` is referenced by its instructions but absent at that baseline;
no living-state evidence is inferred from that missing file. The local Golden Path change repairs this route to its overview and decision status; per-project delivery records own execution state.

| Area                        | Application evidence                                                                           | Alignment / disposition                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                     | package engines >=24 <25; execution Node 24.18.0                                               | Aligned with ADR 0001; initial shell Node 22 required explicit activation                                                                                                                                                          |
| Package manager / container | pnpm 10.19.0, Nx 23.2.1                                                                        | Aligned; Golden Path pins 10.25.0, not a universal required patch; retain approved application pin                                                                                                                                 |
| Framework / bundler         | React 19.2.4, Vite 7.3.5                                                                       | Aligned with ADR 0004; no framework migration                                                                                                                                                                                      |
| Tests                       | Vitest, Playwright, node:test for context CLI                                                  | Aligned with ADR 0002; context gate exercises actual file/link behavior                                                                                                                                                            |
| Styling                     | Published Biome CSS/React 0.0.2                                                                | Aligned with ADR 0003; no palette/component copying                                                                                                                                                                                |
| Strict TS / lint / format   | Local tsconfig and ESLint configuration, eslint-config-prettier and Prettier                   | Gap: published @thijulio/tsconfig, eslint-config, prettier-config are not consumed. Adoption needs package validation and scoped maintenance; DB-00 does not install or change them                                                |
| Tier / database             | Existing light L1; approved single-owner PostgreSQL/Neon, versioned SQL, direct pg and Netlify | Gap: light forbids Prisma/NestJS; product bundles Prisma/NestJS/AWS. No documented intermediate database tier/exception. Retain explicitly approved project stack; shared stack exception remains proposed, not universal adoption |
| AI Toolbox                  | Local governance evidence adapter; governance-core deferred                                    | Published 0.1.0 validation remains a separate gate; no installation, vectors, model calls or providers                                                                                                                             |
| Delivery authority          | Private study formerly competed with stale project routes                                      | DB-00 resolves one technical owner, portable links and implemented-local evidence; private context stays provenance                                                                                                                |

## Reusable improvement demonstrated here

The empty/unconnected context claims contradicted committed connectivity code, and the older import
contract conflicted with its newer execution supplement. Golden Path's new local workflow
`workflows/delivery-context.md` and proposed ADR 0005 capture a bounded reusable preflight:
fresh base, one technical owner, explicit supplement precedence, sanitized pinned references,
deterministic links, project exception register and separate implementation/review/release states.
The corresponding typed site ADR entry mirrors the proposal. No existing stack decision or radar ring changes.

Golden Path local branch: `thijulio/database-context`, worktree recorded in the handoff.
Its primary checkout's existing README edit and untracked adoption directory were not included or overwritten.
Documentation inspection and mirror validation are local evidence; full site build/test availability is
reported in the handoff. The typed ADR module also passes a strict standalone TypeScript check. Both repositories still require independent review and publication authorization.

## Gates before DB-01 and later delivery

- Accept DB-00 context and separately authorize DB-01 from its exact local head, rather than main without DB-00.
- Revalidate planned dependency versions/advisories and package-read access before any approved installation.
- Docker, immutable PostgreSQL image digests and real role tests belong to DB-01; none ran in DB-00.
- Obtain independent SQL/privilege review before accepting DB-01; executor cannot grant that review.
- Resolve shared-config adoption and the database-tier exception through reviewed scoped work, without silently replacing SQL/Neon.
- Hosted targets, real-data import, public read, authentication design, cloud changes and cutover remain separate approvals.

## DB-01 local evidence

Core SQL, safe synthetic targets, checksummed direct-client migrations and distinct-role PostgreSQL tests are now implemented locally. Golden Path adds proposed ADR 0006, the isolated-database workflow, a synchronized typed site entry and executable proposal-mirror checks. No universal tier, ORM/provider choice or locked radar decision changes.

The site now builds and its existing unit test passes after frozen offline dependency installation; the mirror checks and strict typed ADR module check pass. The DB-00 missing-dependencies gate is resolved locally, not a remote CI/review/deploy claim. Golden Path pins pnpm 10.25.0; its checks were replayed explicitly on 10.19.0 with automatic version switching disabled. Its pin remains unchanged, an alignment item for reviewed maintenance. Shared config-package adoption and the intermediate single-owner SQL tier remain unresolved exactly as in DB-00.

See the DB-01 handoff for exact shared head, worktree, command evidence and review gates.
