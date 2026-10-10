# Private library product: hosted handoff

Keep the existing imported production database. Do not create a project, branch, database,
clone or second import. The Google Sheet stays canonical.

## Execution status — 2026-10-09

After reviewing the exact setup, the owner approved hosted configuration and
publication. Migration 0006 is applied, migrations 0001–0005 are unchanged, and
the imported book values matched before/after. The SQL login `sl_app_runtime`
was created with only `library_app_runtime` membership; unsafe role flags,
database CREATE and base book SELECT are absent. Production auth variables are
configured privately and the existing Google client has the production callback.

The live Netlify deploy is `6ac947c2a3371bca7cfa43a4`, with the Nitro `server`
function on Node 24. Public home/health return 200; anonymous private reads return
401 with `no-store`; library HTML uses `no-store`; unknown APIs return 404.
Google login initiation returns its expected callback and identity scopes with a
secure cookie, exercising real hosted OAuth-state storage and Neon transport.
The first uploads omitted the server function because the CLI selected the Nuxt
subdirectory; the corrected deploy uses absolute artifact paths. No Git push or
merge was performed. A subsequent production-branch deploy can replace this
manual version.

The owner completed Google login and confirmed readiness for binding. The private
operator verified the expected owner's email, verified application user and linked
Google account, then bound 174 imported books through the offline transaction.
Replay assigned zero books; an unrelated user identifier returns zero books;
imported book values remain unchanged. The authenticated browser renders 174 cards
without a load error. No book titles, notes, tokens or user IDs were copied into
public evidence. Production sign-out and a second Google account have not been
exercised; those contracts pass local real-session isolation/revocation tests.

Google is External/Testing, with only the owner in its
test users; publication is disabled until app branding is completed. The product
supports multiple users, but this provider restriction currently limits access.

The Netlify plan rejects custom scopes for ordinary variables. `BETTER_AUTH_URL`
uses all default scopes; secret variables use Builds/Functions/Runtime without
Post processing. `BETTER_AUTH_SECRET` and `DATABASE_RUNTIME_URL` are marked secret
and set only for production. These values remain server inputs; they never enter
the public build output.

Target: the existing `thiago-smart-library` Neon project (`noisy-term-15984482`),
its imported production database, and the existing `thiago-smart-library` Netlify
site (`80d4ea79-5405-4e1c-8e78-c453cf8dfe0f`). Confirm the database's direct host
and immutable instance marker privately before execution; no connection URL is
stored in this document.

## Exact changes

1. On the existing production database, apply only
   `0006_user_libraries.sql` through the checksum/instance-guarded migration runner.
   It creates schema `auth` with Better Auth user/session/account/verification
   tables; `library.user_libraries`, `library.library_books`, an internal card
   view and two scoped read functions. It creates the NOLOGIN permission group
   `library_app_runtime`. Existing books remain unassigned; no book values change.
2. Provision one SQL login, `sl_app_runtime`, in that same database. It must have
   `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, membership only
   in `library_app_runtime`, and no other direct grants. Set its password through
   a private operator session. Do not create it with the Neon console role API,
   which may add managed administrator membership. Do not use `neondb_owner`,
   importer, editor or migration credentials in the product runtime.
3. Configure the existing Netlify site's production function environment:

   | Variable               | Value or source                                                                       |
   | ---------------------- | ------------------------------------------------------------------------------------- |
   | `BETTER_AUTH_URL`      | `https://thiago-smart-library.netlify.app`                                            |
   | `BETTER_AUTH_SECRET`   | Newly generated private random secret, at least 32 characters                         |
   | `GOOGLE_CLIENT_ID`     | Existing product OAuth client; already configured per prior handoff                   |
   | `GOOGLE_CLIENT_SECRET` | Existing private product OAuth secret; never print it                                 |
   | `DATABASE_RUNTIME_URL` | Pooled Neon URL for `sl_app_runtime`, same imported production database, TLS required |

   These are server variables, never `NUXT_PUBLIC_*`. Keep credentials out of
   build arguments and logs. The existing `DATABASE_URL` remains a diagnostic
   `SELECT 1` connection only; auth/catalog never fall back to it. No production
   credentials are added to previews or local test fixtures.

4. In the existing Google OAuth client, ensure this origin and callback:
   `https://thiago-smart-library.netlify.app` and
   `https://thiago-smart-library.netlify.app/api/auth/callback/google`.
   The product requests only `openid email profile` and does not inherit prior
   Drive scopes. Verify the Google app audience allows the intended users;
   Google test-user restrictions can otherwise prevent open registration.
   No new Google client is required.
5. After separately approved deployment, the owner completes the first Google
   login. New users see empty private libraries. Privately verify the owner's
   `auth."user"` row, verified email and app ID; do not bind a provider subject
   or trust the first registrant as owner. Bind imported books in a separate
   approved offline transaction. No automatic signup/startup/build binding.

Every hosted action above requires explicit owner approval at execution time.
The owner's subsequent approval covered the setup and manual deploy recorded
above; future hosted actions still require approval for their concrete scope.

## Offline commands after approval

Use private environment injection; never paste connection URLs into commands,
chat, documentation or logs. Confirm the exact direct Neon host privately.
The instance UUID must match the already marked production database.

```sh
pnpm db:status --target production --confirm-host "$LIBRARY_DIRECT_HOST" --confirm-production
pnpm db:migrate --target production --confirm-host "$LIBRARY_DIRECT_HOST" --confirm-production
```

Those commands read private `DB_MIGRATION_URL` and `DB_TARGET_INSTANCE_ID`. They
must reject inherited `DATABASE_URL`. Review the pending migration before applying.

The following is the exact login grant shape; supply the password privately
during provisioning rather than using this snippet as a complete command:

```sql
CREATE ROLE sl_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
GRANT library_app_runtime TO sl_app_runtime;
```

Verify this login can persist auth records and call the two scoped functions,
but cannot SELECT base library/import tables, change ownership, execute writer
routines, SET ROLE library_owner or create schema objects.

For owner binding, provide private `DB_OWNER_URL` using an offline owner-capable
login, `LIBRARY_OWNER_USER_ID` from the verified row and `DB_TARGET_INSTANCE_ID`:

```sh
pnpm db:bind-owner --target production --confirm-host "$LIBRARY_DIRECT_HOST" --confirm-production
```

The command prints only the assigned count. It locks ownership and books,
requires a verified application user, refuses a different existing library
owner, preserves book values/IDs and is idempotent for the same user. This
initial-import command deliberately refuses multi-library reassignment; future
user writes require their own scoped contract.

## Build and validation

`pnpm build` produces a local Node server. `pnpm build:netlify` produces the
Nitro Netlify function in `.netlify/functions-internal/server` and static assets
in `dist/apps/web/public`. Netlify uses the generated function routing, with no
old React SPA fallback. No SQL or import command runs during either build.

Local checks: `pnpm check`, `pnpm test:db`, `pnpm test:e2e` and
`pnpm build:netlify`. Browser tests use synthetic display fixtures; PostgreSQL
tests use real signed Better Auth sessions, independent users and restricted
roles. Hosted Google login/callback, Neon transport and the owner's authenticated
174-book library now pass. Opening Google access beyond test users remains a
separate audience publication step.

For a reviewed manual release of already built artifacts, use absolute paths
because the CLI may select `apps/web` as its working directory:

```sh
pnpm exec netlify deploy --site 80d4ea79-5405-4e1c-8e78-c453cf8dfe0f --prod --no-build --dir "$LIBRARY_REPO/dist/apps/web/public" --functions "$LIBRARY_REPO/.netlify/functions-internal" --skip-functions-cache
```

Set `LIBRARY_REPO` to the checkout's absolute path. The CLI's `--context` flag
requires a build and must not accompany this `--no-build` invocation. `.netlify`
is ignored; linking metadata must never be committed.

After deployment, verify anonymous home/HTML/payload responses contain no books,
unauthenticated private reads return 401, all private routes have `no-store`,
owner reads show their books and a second account sees an empty library and
cannot fetch an owner book by its stable ID. Verify sign-out/session revocation
and perform no production test writes to book records.

If hosted validation fails, fix the application and publish a corrected build.
The additive schema can remain in place; do not drop auth/ownership records
automatically. Any database rollback is a separately approved operation.
