# Product and takeover decisions

Taken on 2026-10-04 when Claude Code took over from Codex. Source: [takeover design](../superpowers/specs/2026-10-04-smart-library-takeover-design.md) §3.

| ID   | Decision                                                                                                                                      | Replaces                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| T-01 | Claude Code is the only agent driving this project                                                                                            | Codex execution                                                                              |
| T-02 | Replacement means full prototype parity plus Sheet retirement; all features are required before cutover                                       | Undefined end state; DB-05 owner CLI as final interface                                      |
| T-03 | Writes happen through a browser editor and a remote MCP server used from ChatGPT and Claude                                                   | Local owner CLI as the only private write path                                               |
| T-04 | In-app AI: MCP is the primary AI path; the Playground keeps server-side provider keys; Sign in with ChatGPT becomes a post-cutover experiment | P-02 "ChatGPT-only, no platform keys" in PR #20                                              |
| T-05 | Keep DB-01, DB-02 and the WIP; the database structure spec and execution contracts remain the data contract                                   | —                                                                                            |
| T-06 | Frontend: Nuxt 4 (≥ 4.5.2), Vue 3.5, Vue Router 5, Vite 8; start now and upgrade to Nuxt 5 when stable                                        | React 19 web app and `apps/api` functions                                                    |
| T-07 | Biome is consumed through a new published `@thijulio/biome-vue` package                                                                       | `@thijulio/biome-react`                                                                      |
| T-08 | Identity: Better Auth 1.7, self-hosted, with `oauth-provider`, `mcp` and `cimd` plugins; Google login restricted to the owner email           | Netlify Identity (cannot act as an MCP authorization server)                                 |
| T-09 | Privacy: the owner sees everything when signed in; visitors see the catalog view defined by spec §9                                           | Prototype behavior of publishing notes, opinions, ratings, pros/cons, relevance and Why Next |
| T-10 | Deploy previews read a real-data copy on a dedicated Neon branch                                                                              | —                                                                                            |
| T-11 | Golden Path coupling is loose: one exception ADR (PostgreSQL/Neon, Nuxt, Better Auth); contribute reusable findings as separate PRs           | Per-ticket Golden Path obligation                                                            |
| T-12 | Milestones are defined by goals and exit checks, not by time                                                                                  | —                                                                                            |

## Superseded

- P-02 "ChatGPT is the only planned AI connection" (closed PR #20) is superseded by T-04.
- The DB-05 owner CLI as final private interface is superseded by T-02 and T-03.

## Product implementation direction — 2026-10-09

Owner decision T-13 replaces the separate M0 spike prerequisite: discuss product ideas,
implement them in the product, and validate them against the existing production environment.
Reuse the existing Smart Library Neon project, imported production database, and Netlify site.
Do not create dedicated spike projects, databases, branch deployments, or additional spike
configuration. The imported library is already available; this is not another import task.

OAuth, MCP compatibility, and function latency must still be verified when their product
features are implemented. The previous throwaway spike is no longer a prerequisite for M1;
this decision does not claim issue #27 passed. Its GitHub tracking still needs reconciliation.
The existing spike setup proposals and Task 10 are superseded for execution.

Start the product discussion with the Library catalog and book detail, using the planned
Nuxt/Vue architecture and published Biome components. Production data and credentials remain
private. Live validation starts with reads; deployments, hosted SQL, and data-changing actions
still require approval for the concrete action. The Google Sheet remains canonical until an
explicit cutover decision.

## Private libraries for any user — 2026-10-09

Owner decision T-14: the anonymous surface explains the product; books belong to
private authenticated libraries. The product is for any user. Google is the first
login method; application user IDs own libraries independently of the provider.
Only the owner's existing library is populated today. New verified users start
with an empty library and receive no access to the owner's books. Other login
providers and scoped editing can follow without changing ownership keys.

This supersedes the single-owner-only auth and public-catalog assumptions for the
first product slice. See the [private library spec](../superpowers/specs/2026-10-09-private-library-product.md)
and [hosted handoff](../database/runbooks/private-library-product.md). The existing
production environment is reused; no spike setup, reimport or automatic cutover.

## Product planning review — 2026-10-10

The owner requested a product definition, benchmark and trackable roadmap,
then supplied the private Smart Library folder as previous discussion context.
The [source review](direction-and-evidence.md) recovers the reading-memory and
grounded-assistance intent. The [brief](overview.md) and [roadmap](../roadmap/README.md)
separate confirmed principles from proposals. This is not a new accepted
T-series decision: native production writes before M5, pilot/AI scope and any
change to the full-parity cutover gate still need explicit review.

T-01 describes the historical takeover agent choice; it does not prohibit the
owner's subsequent Codex work. T-08/T-09 owner-only/public-catalog assumptions
are superseded by T-14; T-13 removes the standalone spike prerequisite.
