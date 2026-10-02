# Context ownership map

The implementation repository is canonical for sanitized requirements, plans, code, tests and delivery evidence.
The private Smart Library context folder owns broad product intent and historical/raw study evidence.
Its `repo/` symlink is a local convenience; GitHub readers use this repository's documents directly.
During local delivery that symlink still points at the preserved primary checkout, which lacks DB-00;
use the isolated worktree named in the handoff until integration is separately authorized.

| Information                      | Owner                                                      | Rule                                                 |
| -------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Current approved DB requirements | [spec](spec.md) + [addendum](plans/execution-contracts.md) | Addendum precedence; review changes with code impact |
| Task execution/evidence          | [status](status.md), ticket handoffs                       | Evidence links, no secrets                           |
| Original spreadsheet/study       | Private context evidence folder                            | Read-only evidence, not CI input                     |
| Current prototype records        | Live Sheet until signed cutover                            | This pack never edits it                             |
| Operational cloud state          | Fresh provider/CLI evidence                                | Docs are dated observations                          |
| Broad product intent             | Private context `docs/product-thesis.md`                   | [Short technical summary](README.md) in repository   |

Provenance: private context `docs/2026-09-19-database-structure.md` and
`docs/superpowers/plans/2026-09-20-database-delivery/` were promotion inputs on 2026-10-02.
They are superseded for implementation. Do not maintain competing execution contracts.
Original `docs/schema/schema.sql` remains a historical private prototype; versioned migrations replace it.
Required execution links stay inside this repository. Optional private provenance is described as text,
so a fresh clone does not require the personal workspace.
