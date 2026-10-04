# Operations

`pnpm build` emits the web bundle to `dist/apps/web` and the Netlify-compatible ESM health
functions to `dist/apps/api/functions`. `netlify.toml` maps `/api/health` and `/api/health/db`
before the SPA fallback; unknown API routes return 404.

`pnpm dev:netlify` rebuilds the web and API outputs, serves the built web through Netlify's
local proxy, and loads the source health functions. This is also the HTTP boundary exercised
by the browser suite.

The `thiago-smart-library` Netlify site is connected to this GitHub repository with `main` as
its production branch. Netlify builds require `NPM_TOKEN` as a protected build secret so pnpm
can install the private `@thijulio` packages. Pull requests receive deploy previews, while
updates to `main` deploy to production automatically.

`/api/health/db` performs only `SELECT 1` through the server-side `DATABASE_URL` value. Set it
to the Neon pooled connection string with the Functions scope; never give it a `VITE_` prefix or
commit it to the repository. The endpoint returns only `ok` or `unavailable` and exposes no
database detail.

## Hosted environments

One Neon project holds two branches, each with its own `smart_library` database and its own
environment marker written by `db:bootstrap`:

| Neon branch  | Purpose   | Marker       | Used by                                   |
| ------------ | --------- | ------------ | ----------------------------------------- |
| `production` | default   | `production` | the production Netlify site, real imports |
| `staging`    | rehearsal | `staging`    | import rehearsals before production       |

A `preview` branch is created from `staging` after the first import (M0 Task 9) for deploy
previews. The `neondb` database on `production` only serves the `/api/health/db` check until M1.

### Logins

| Login              | Group                   | Used for                                              |
| ------------------ | ----------------------- | ----------------------------------------------------- |
| `neondb_owner`     | owner (Neon-managed)    | `db:bootstrap`, `db:migrate` from the owner's machine |
| `sl_importer`      | `library_importer`      | `db:import`, `db:verify`, `db:doctor`                 |
| `sl_public_reader` | `library_public_reader` | the public API (M1) and deploy previews               |

The editor login is created in M2. The import refuses any login that holds `library_owner`.

Login passwords are 64-character hex strings kept in the owner's macOS login Keychain as generic
passwords with service `smart-library-<branch>` and account `<login>`. Neon forwards role DDL to
its control plane and accepts only plaintext passwords, so `\password` (which sends a SCRAM
verifier) fails; set or rotate a password with `ALTER ROLE <login> PASSWORD '<value>'` over a
`verify-full` TLS connection, reading the value from the Keychain without printing it:

```bash
security find-generic-password -a sl_importer -s smart-library-staging -w
```

Hosts, connection strings and environment instance IDs stay in the owner's private notes and
Keychain, never in the repository.

### Netlify contexts

- Production: `DATABASE_URL` (health check), `NPM_TOKEN`, `WRITES_ENABLED=false` until the M5
  cutover.
- Deploy previews and branch deploys: `NPM_TOKEN` only. They never receive an owner or importer
  credential; the public-reader credential for the `preview` branch is added in M1.
