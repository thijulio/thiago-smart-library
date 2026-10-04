# Smart Library roadmap

Planning snapshot: 2026-10-04. The design behind this roadmap is
[the takeover and delivery design](../superpowers/specs/2026-10-04-smart-library-takeover-design.md).
GitHub milestones and issues own live status; this page owns sequence, goals and exit checks.

## Destination

Smart Library replaces the Thiago Library prototype when it offers every prototype capability
and the Google Sheet is no longer written to. Daily capture works from ChatGPT and Claude through
a remote MCP server; a browser editor covers manual changes and Book Battle.

## Milestones

| Milestone                       | Goal                                                                                                | Exit check                                                                                                                                           | Depends on      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| P1 — biome-vue (design-systems) | Biome components for Vue                                                                            | `@thijulio/biome-vue` published and installable                                                                                                      | —               |
| M0 — Takeover                   | One source of truth; Codex work on `main`; real data in production; architecture assumptions proven | DB work merged with green CI; production `db:verify` reconciles with the imported export; documents agree; MCP-on-Nitro and Better Auth spike passed | —               |
| M1 — Read parity                | Visitors see the full catalog from PostgreSQL                                                       | Production public site matches the prototype's visitor view minus private fields; rebuilt ranking matches the Sheet within tolerance                 | M0 (UI also P1) |
| M2 — Identity and writes        | Every prototype edit, plus create, on staging                                                       | All prototype edits and Book Battle work on staging; production stays read-only                                                                      | M1              |
| M3 — MCP                        | Capture through ChatGPT and Claude                                                                  | From both assistants, a finished book with feedback and a recap lands correctly on staging                                                           | M2              |
| M4 — Remaining parity           | Parity list complete                                                                                | Parity checklist 100% on staging                                                                                                                     | M2              |
| M5 — Cutover                    | Sheet retired                                                                                       | Nothing writes to the Sheet; rollback rehearsed and documented                                                                                       | M3, M4          |
| Backlog                         | Post-cutover candidates                                                                             | Not committed                                                                                                                                        | —               |

M3 and M4 can run in parallel once M2 is done. Within M1, the data imports (#7, #8) start right after M0; only the screens wait for P1.

## Working rules

- Detailed tickets exist only for the current milestones. The scope of later milestones lives in
  the section below and is broken into issues when the milestone starts, so tickets do not go
  stale. Roadmap phases are never GitHub issues (Golden Path ADR 0007).
- Every PR runs `pnpm check`; database work also runs the real-PostgreSQL suite.
- Merge, deploy, hosted migrations, hosted imports, Neon/Netlify configuration and cutover each
  need explicit owner approval.
- Until M5, production is a read model refreshed by the importer and the Sheet stays canonical.

## Milestone scope not yet broken into issues

- **M1 — Read parity:** Nuxt app replacing the React app and `apps/api` (health URLs preserved);
  ranking engine port; public API on allowlisted views; Library, detail, Reading/Up Next (public
  part), Stats, Favorites, recap reader; freshness indicator; privacy e2e. Existing issues: #7, #8.
- **M2 — Identity and writes:** apply the M0 spike results; owner sign-in with full private view;
  editor with create, archive and restore; Up Next management; Book Battle votes and undo with
  cache invalidation. Writes run on staging only while production keeps `WRITES_ENABLED=false`.
  Preview gate: every deploy-preview route requires the owner's Google sign-in.
- **M3 — MCP:** MCP server and tools (spec §6.3); connectors in ChatGPT and Claude against
  staging; `save_recap` with server-side validation; recaps workflow retargeted.
- **M4 — Remaining parity:** Playground with server-side keys; `apps/jobs` weekly jobs; cover
  lookup.
- **M5 — Cutover:** backup/restore rehearsal, Sheet freeze, final import, enable production
  writes, switch connectors, retire the prototype, archive the Sheet export. Existing issues:
  #10, #11.

## Parity checklist (M4 exit)

Library browse and filters · book detail with series progress, same-author books and quotes ·
Reading and Up Next · Stats · Favorites ranking · Book Battle with undo · recap reader ·
editor with create, archive and restore · AI Playground · community ratings job ·
author highlights job · cover lookup · MCP capture from ChatGPT and Claude.
