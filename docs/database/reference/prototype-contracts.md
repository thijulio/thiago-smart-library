# Pinned prototype compatibility contracts

Source: [thijulio/thiago-library](https://github.com/thijulio/thiago-library), commit
`da23c6b98f9a029ab357f60691fc57f7bfe4f9d9`. Retrieved 2026-10-02 with `git show` from the verified origin repository.
Only the four inspected code modules were captured; no snapshot JSON, records, secrets or source exports.
The source commit contains no LICENSE/COPYING file; no license grant is inferred and no relicensing is performed.
Attribution belongs to the source repository and its Git history. Original bytes and comments are retained.

| Original path / checked-in reference                                   | Role                                                                    | SHA-256 of exact bytes                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [src/recap-catalog.mjs](prototype/src/recap-catalog.mjs)               | Recap parsing and structural validation; DB-03                          | `9b010de1b4deaf3b56519498eed1d524f669c91c725ce6109156746a9c404c18` |
| [src/ranking-engine.mjs](prototype/src/ranking-engine.mjs)             | Bradley–Terry fit, effective events and ranking revision; DB-04         | `2b6153c85a5582a65c7ccc3b800ab155a22a4c6b6f26b69df82942d856d81432` |
| [src/ranking-scheduler.mjs](prototype/src/ranking-scheduler.mjs)       | Canonical pair identity and comparison scheduling; DB-04                | `deae3ccd5fd4c035bb98b760564f08d038eb2150a3d639cbcbec410f2e7b132b` |
| [netlify/lib/ranking-core.mjs](prototype/netlify/lib/ranking-core.mjs) | Sheet event/ranking contracts and replacement/undo compatibility; DB-04 | `15872efc01193fc58a25d8a82c970cc976ccca58251b365104955c25981c062e` |

These files are non-executable documentation references, outside product project inputs.
Do not import them at runtime or resolve an absolute path to another checkout. Port into the approved
server-only library with synthetic compatibility tests; record port source hashes at that time.
The captured reference hashes above describe retrieval, not completed ports.

Known defects must not be ported: ranking-core validates eligibility before retry and compares an
incomplete decision payload. The canonical contract requires payload-aware retries before eligibility.
Ranking tie-break locale must be pinned; event hash alone does not track title/eligibility freshness.
DB-03 must quarantine malformed provenance without copying the reference's all-or-nothing parser behavior.
Historical `docs/data-contracts.md` and `docs/schema/schema.sql` remain private/reference provenance;
versioned migrations, not the old SQL, implement the approved schema. No retrieval gate remains for these four modules.
