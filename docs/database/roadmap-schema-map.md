# Product roadmap and schema mapping

Reviewed from repository migrations 0001–0006 on 2026-10-10. This is a structural
source review, not a live Neon inspection. No private records were read.

The current implementation source is `libs/database/migrations/` together with
the bootstrap/migration runner. `docs/database/spec.md` describes wider intended
contracts, including work not yet implemented; it must not be rendered as though
every planned table exists. The execution addendum and later private-library
decisions supersede specific historical single-owner/public-catalog assumptions.

## Existing ownership boundary

`auth.user` → `library.user_libraries.owner_user_id` →
`library.library_books.library_id` → `library.books.id`.

Each book membership is exclusive. The current scoped view/routines are
`library.user_book_cards`, `library.catalog_for_user` and `library.book_for_user`.
New private outputs must resolve ownership through the application user, not a
Google email/subject or a global public catalog. Browser DTOs do not bypass this.

## Current storage versus planned work

| Workflow                     | Existing structure                                                                                                     | Required extension or reviewed reuse                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current reading (#45)        | `books.status`, `platform`, completion bounds/precision; scoped cards                                                  | Expose the necessary private projection; distinguish empty from unavailable source information. No new AI table is needed just to display current reading.                                                               |
| Taste relevance (#16)        | `book_feedback` rating/opinion/notes; `book_assessments.personal_relevance`, reason and review state; field provenance | Review which imported inputs are available and whether assessments can be reused safely. Add user-scoped calculation/input/model/rubric lineage and refresh semantics without overwriting imported assessments silently. |
| Best format (#52)            | One recorded `books.platform`, word count and available book information                                               | Platform is not a catalog of all editions or a suitability score. Add the minimum source-backed edition/format evidence and per-user judgments; full bibliographic expansion is not assumed.                             |
| Ordered plans (#53/#54)      | Legacy `books.next_rank`, `next_slot`, `why_next`, series/volume                                                       | Imported explicit Next fields do not define revisioned independent generated plans or deferral history. Add plan revisions, ordered entries and owner-scoped scheduling reasons through #50.                             |
| Story filtering (#14/#15)    | Genres and `book_genres`; existing descriptive inputs where authorized                                                 | Add source-backed reusable characteristics and description lineage, plus query-specific match results. Genre tags alone do not preserve all story relationships.                                                         |
| Event refresh (#51)          | Migration/import ledgers; `owner_requests` retry receipts                                                              | Those ledgers are not an AI job queue. Define durable refresh intent, input invalidation, job/revision ownership and safe retry.                                                                                         |
| Finish/status/feedback (#46) | Status/completion fields, `book_feedback`, narrow offline owner operations                                             | A reviewed app-user writer/authority contract must determine native versus imported updates and Sheet reconciliation before hosted writes.                                                                               |

These are design requirements, not final new table names or SQL. #50 defines the
shared native/imported/derived authority boundary and versioned persistence.
Core book IDs, existing membership and source provenance remain stable.

## Connecting delivery to database changes

1. A ticket names the current storage it consumes and any required extension.
2. The feature design defines ownership, constraints, permissions, provenance,
   concurrency, importer coexistence and recovery.
3. An immutable migration uses the next free version at execution; applied
   migrations are not edited or replaced from the historical schema prototype.
4. Disposable real-PostgreSQL tests verify the contract and user isolation.
5. Hosted application is a separately reviewed action. Main's latest schema and
   Neon's applied schema are distinct states until deployment evidence confirms
   the exact migration set.

The proposed [schema-reference site](schema-reference-proposal.md) will generate
actual implemented structure automatically from the migrations. This mapping
stays a reviewed explanation of future product work, clearly labeled as planned.
