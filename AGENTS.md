# Repository guidance

Smart Library provides private libraries for any user, initially with only the owner's imported
library populated. Google is the first provider; application user IDs own libraries. It replaces
the Thiago Library prototype. Start with `docs/roadmap/README.md` and the takeover design in
`docs/superpowers/specs/`. Live status is in GitHub milestones and issues.

## Boundaries

- Durable code, documentation, tests and change descriptions are in English.
- Preserve the Nx dependency direction in `docs/architecture.md`; browser code never imports
  server-only libraries (`libs/database`, `libs/importer` and later server libraries).
- Work only within the approved milestone scope. Database, import, MCP and AI work are in scope
  when a milestone ticket covers them.
- `docs/database/spec.md` and `docs/database/plans/execution-contracts.md` are the data contract;
  the execution addendum takes precedence on specific rules.
- Consume published `@thijulio` Biome packages; never copy tokens, palettes or components.
- Never put real library data, snapshots, import reports, backups, credentials or database URLs
  in Git, CI logs, frontend bundles or prompts.
- Never run migrations or imports during a Netlify build or function startup; never execute the
  historical schema prototype.
- The Google Sheet stays canonical until the M5 cutover. Do not modify the prototype repository,
  its Sheet or its Netlify site.

## Approvals

Merges, deploys, hosted migrations, hosted imports, Neon/Netlify changes and cutover each need
explicit owner approval at the time of the action.

## Checks

- Node 24, pnpm 10.19.0.
- `pnpm check` for format, lint, typecheck, unit tests, build and the browser bundle boundary.
- `pnpm test:db` for real-PostgreSQL integration tests (`pnpm db:up` starts the disposable server).
- `pnpm test:e2e` for the built UI and local HTTP routing.
- `pnpm dev` for frontend iteration; `pnpm dev:netlify` for built local HTTP checks.
