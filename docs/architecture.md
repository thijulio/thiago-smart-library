# Architecture

The `web` application composes `ui` and fetches the diagnostic health endpoint through
`data-access`. `domain` owns the framework-free `HealthResponse` contract. The API function
is separate from browser code and returns no personal data.

Nx tags enforce the allowed direction: web → ui/data-access/domain,
data-access → domain, ui → domain, and api → domain. `libs/ai` is documentation only until a
separately approved AI capability needs a real boundary.
