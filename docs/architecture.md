# Architecture

The `web` application composes `ui` and fetches the diagnostic health endpoint through
`data-access`. `domain` owns the framework-free `HealthResponse` contract. The API function
is separate from browser code and returns no personal data.

Nx tags enforce the allowed direction: web → ui/data-access/domain,
data-access → domain, ui → domain, and api → domain. `libs/ai` is documentation only until a
separately approved AI capability needs a real boundary.

## Planned database boundaries

The current graph above is implemented. The [database delivery pack](database/plans/README.md)
plans api → database/domain, database → domain, and importer → database/domain.
DB-01 must add database project configuration and enforce its new edges; DB-02 adds importer.
Neither project nor edge is implemented by DB-00. Browser web/data-access/ui cannot import either
server-only project; browser calls use HTTP DTOs from domain. No migrations run at build or startup.
