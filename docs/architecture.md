# Architecture

The `web` application composes `ui` and fetches the diagnostic health endpoint through
`data-access`. `domain` owns the framework-free `HealthResponse` contract. The API function
is separate from browser code and returns no personal data.

Nx tags enforce the allowed direction: web → ui/data-access/domain,
data-access → domain, ui → domain, and api → domain. `libs/ai` is documentation only until a
separately approved AI capability needs a real boundary.

## Future ChatGPT connection

The [product direction](product/chatgpt-connection.md) selects user-authorized
ChatGPT as the only planned AI connection. Application sessions, library
permissions and AI inference authorization are distinct design concerns.
Hosted eligibility and a reviewed integration design are prerequisites; no
authentication/provider boundary is implemented by documenting this intent.
`libs/ai` remains documentation-only, and the approved database plan retains
its single-owner scope.
