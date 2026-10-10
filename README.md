# Smart Library

## [🌐 Open Smart Library](https://thiago-smart-library.netlify.app)

A private reading library for any user. Google is the first sign-in method;
application user IDs own libraries independently of the identity provider.
The existing Thiago Library prototype and Google Sheet stay unchanged until
an explicit cutover.

Published site: [thiago-smart-library.netlify.app](https://thiago-smart-library.netlify.app/).

## Local implementation and hosted state

This branch implements a public product landing page and an authenticated library
with book search, status filtering, details and sign-out. New verified users see
an empty library. Existing imported books are assigned to the owner's application
user ID through a separate offline action, never to the first person who signs up.

The owner approved hosted setup and publication on 2026-10-09. The product is live
on the existing site; migration 0006, the restricted runtime login and private
production configuration are applied to the existing imported database. Public
and anonymous private-route checks pass, and Google login initiation persists
OAuth verification state over the hosted Neon transport. The owner completed
Google login; 174 imported books are bound to the verified application user and
render in the authenticated browser. Google remains External/Testing with the owner
as its test user; opening Google access to everyone needs completed app branding
and a separately reviewed audience publication. MCP capture and editing remain
future work.

Reuse the existing imported Neon production database and Netlify site. No spike
project, clone, extra auth database or reimport. The Google Sheet remains canonical;
imports and migrations never run during builds or server startup.

## Stack

| Layer             | Implementation                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| Runtime/workspace | Node 24, pnpm 10.19.0, Nx 23.2.1, TypeScript 5.9.3                       |
| Product and HTTP  | Nuxt 4.6.0, Vue 3.5.43, Nitro on Netlify                                 |
| Design            | Published `@thijulio/biome-css` 0.0.2; semantic HTML/product layouts     |
| Auth              | Better Auth 1.7.7, Google identity scopes, provider-neutral app user IDs |
| Runtime database  | Neon serverless 1.2.0, WebSocket pool, restricted auth/scoped read role  |
| Offline database  | PostgreSQL migrations and transactional importer, `pg` 8.23.0            |
| Source extraction | ExcelJS 4.4.0; private immutable export evidence                         |
| Checks            | ESLint, Prettier, Vitest, real PostgreSQL, Playwright and axe            |

The published Vue component package could not be resolved from the current
registry. This slice consumes Biome CSS without copying tokens, palettes or
component source. Shared Vue compositions can replace native controls later.

Browser code cannot import server/database/importer modules. Private books do not
enter public HTML or bundles; private/auth responses use `no-store`. Credentials
and real snapshots never enter Git, browser bundles, prompts or test fixtures.

## Development

Use Node 24 and pnpm 10.19.0. Supply a GitHub Packages `read:packages` credential
privately as `NPM_TOKEN`; `.npmrc` contains only its environment reference.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm db:up
pnpm test:db
pnpm test:e2e
pnpm build:netlify
```

`pnpm dev` starts Nuxt. `pnpm dev:netlify` retains its existing command name for
the built local Node server/HTTP checks; it does not emulate the Netlify provider.
`pnpm build:netlify` generates the actual Nitro Netlify function and static assets.
Hosted Google login, callback, Neon transport, owner binding and the authenticated
174-book library have been checked. Production sign-out and a second Google
account have not been exercised; local signed-session isolation/revocation tests
cover those contracts.
The public page works without secrets; login fails safely until configured.

## Documentation

- [Product brief](docs/product/overview.md), [recovered direction](docs/product/direction-and-evidence.md)
  and [reading-product benchmark](docs/product/benchmark-2026-10-10.md)
- [Reading priorities and Jev planning](docs/product/ai-recommendations.md)
- [Private product spec](docs/superpowers/specs/2026-10-09-private-library-product.md)
- [Exact hosted setup and owner binding](docs/database/runbooks/private-library-product.md)
- [Product decisions](docs/product/decisions.md), [architecture](docs/architecture.md)
- [Roadmap](docs/roadmap/README.md); GitHub milestones/issues own live tracking
- [Database contract](docs/database/README.md) and its execution addendum

Hosted migrations, imports, provider changes, owner binding, merges, deploys and
cutover require explicit approval for the concrete action. PR #48 integrated the
private-library product into main (b248673); issue #28 records the approved
Git-backed production publication on 2026-10-10. Subsequent releases must keep
the reviewed code, Git commit and production deployment aligned.
