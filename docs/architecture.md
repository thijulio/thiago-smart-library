# Architecture

The `web` application composes `ui` and fetches the diagnostic health endpoint through
`data-access`. `domain` owns the framework-free `HealthResponse` contract. The API function
is separate from browser code and returns no personal data.

Nx tags enforce the allowed direction: web → ui/data-access/domain,
data-access → domain, ui → domain, and api → domain. `libs/ai` is documentation only until a
separately approved AI capability needs a real boundary.

## Database delivery boundaries

The [database delivery pack](database/plans/README.md) adds api → database/domain,
database → domain, and importer → database/domain. DB-01 implements the database edge;
DB-02 implements the importer edge and pure import DTOs in domain. Browser web/data-access/ui cannot import either
server-only project; browser calls use HTTP DTOs from domain. No migrations run at build or startup.

## DB-01 local server boundary

`libs/database` is tagged `scope:database` and depends only on domain DTOs. API may depend
on database/domain; web, UI and data-access cannot import it. The `scope:importer`
edge is importer → database/domain, without changing frontend edges. SQL migrations and
owner operations remain local, server-only infrastructure; they are not invoked by the API,
frontend bundle, build or startup. Unit tests run in `pnpm check`; actual PostgreSQL tests
are a separate required database workflow. See [local development](database/runbooks/local-development.md).

## DB-02 local import boundary

`libs/importer` is server-only tooling, tagged `scope:importer` and `type:server`.
ExcelJS is a development dependency used by extraction; it cannot enter browser code.
Pure evidence and report DTOs live in domain. The database library exports marked-local
connection inspection; test harness access uses the explicit database/testing alias.
The importer stages every tab but applies only the core scope. Later scopes remain gated.
No extraction, import, migration or verification runs during build/API startup.
See the [core import runbook](database/runbooks/core-import.md).
