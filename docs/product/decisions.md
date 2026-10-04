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
