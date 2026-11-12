# MCP activation on the existing product

This is a prepared release procedure, not authorization to execute it. Use the
existing Neon project, production database and Netlify site. See the
[implemented API and MCP surface](../../mcp.md) and the
[execution contract](../plans/execution-contracts.md).

## Read-only readiness snapshot — 2026-11-12

- PR #66 is merged as `cd443a175905503a4eb0c4dff5c484ee1c02a41f`.
  CI, Database and Schema reference passed on that exact main commit.
- Netlify production deploy `6af4e6f04ab93ee08dc3aeb0` is ready and publishes
  that commit at `https://thiago-smart-library.netlify.app`.
- The existing Neon project is `noisy-term-15984482`; production branch
  `br-soft-dust-b4z6o9lt`, database `smart_library`. The default `neondb` is
  a different database and is not this application's migration target.
- Production migration history is `0001`–`0007`. All seven recorded checksums
  match the repository. Native permission and OAuth tables are absent.
- `sl_app_runtime` has no superuser, role/database creation, replication or RLS
  bypass capability. Its only role membership is `library_app_runtime`.
- Production Google login, auth secret and runtime database variables are
  configured. Secret values were not printed or copied. `BETTER_AUTH_URL`
  matches the production HTTPS origin. `MCP_OAUTH_ENABLED` is absent.
- Anonymous HTTP checks: `/api/health` returns 200 and `/mcp` returns 503.
  The latter is consistent with the disabled MCP provider, not a completed
  assistant connection.

These are dated observations. Repeat them before an approved operation. No
migration, permission, environment value, book or Sheet was changed to obtain them.

## Pending migration manifest

Apply the complete pending sequence through the guarded runner; do not apply
only 0011 and 0012. The native writer depends on helpers from 0008–0010.

| Migration                              | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `0008_scoped_ai_storage.sql`           | `7b05fef5a24a4d6c65832744a42e967dd06e5b5ac3dc329f9cb1990d5efcbd21` |
| `0009_scoped_ai_result_operations.sql` | `48b9716f2ee4b007918f4ca92a913db9997a81f7216543a8484d5db094eb3b42` |
| `0010_scoped_plan_operations.sql`      | `a4beb6fac040dc2112f3395e856d89790a09cd24b3f3b7ee596ec48fceafa7da` |
| `0011_native_book_changes.sql`         | `26484c9d0e6713c14985dbcc808d6fde51cf8986af927446cf247d1a5af57d1b` |
| `0012_mcp_oauth.sql`                   | `34c0f98b106a93a1f8209ef245c88c2c9ddc6a9607179b90003b7eb982327c61` |

0008–0010 add app-owned result, preference and plan storage/functions. 0011 adds
native permissions, native markers, immutable proposals and scoped book writers.
0012 adds the Better Auth OAuth provider tables and narrow runtime grants.
Applying them does not grant native-write permission or call an AI provider.

## Preflight and staged activation

1. Confirm the approved checkout, direct production host and existing immutable
   instance marker privately. Use the existing migration role, not the runtime
   login. Never save connection URLs, marker values, user IDs or tokens here.
   Do not bootstrap another marker or create another database to fix a mismatch.
2. Run [the read-only metadata query](sql/mcp-preflight.sql), compare migration
   names/checksums and confirm the runtime remains restricted. The private relation-access and legacy
   runtime EXECUTE lists must both be empty. This query works before and after 0011;
   it does not select private books, users, session contents or OAuth tokens.
3. Use the established CLI with privately supplied `DB_MIGRATION_URL`,
   `DB_TARGET_INSTANCE_ID` and a confirmed direct-host variable. For example:

   ```sh
   corepack pnpm db:doctor --target production --confirm-host "$MCP_RELEASE_DIRECT_HOST" --confirm-production
   corepack pnpm db:status --target production --confirm-host "$MCP_RELEASE_DIRECT_HOST" --confirm-production
   ```

4. After approval of this exact hosted migration batch, run:

   ```sh
   corepack pnpm db:migrate --target production --confirm-host "$MCP_RELEASE_DIRECT_HOST" --confirm-production
   ```

   Re-run status/preflight. Expect all twelve matching migrations, both new
   table flags true, restricted runtime, no direct private relation access and no legacy writer
   EXECUTE grants.
   Verify native permissions remain absent/disabled and imported records remain
   nonwritable. Each migration is transactional; the whole batch is not one
   transaction. If a later migration fails, record the committed prefix and
   stop. Review the failure before resuming; never edit applied SQL or drop
   newly installed tables as an improvised rollback.

5. After separate approval of the production configuration/publication, create
   `MCP_OAUTH_ENABLED=true` for production functions on the existing Netlify
   site and publish a production build. Reuse the existing auth secret, Google
   client and runtime database login. Do not enable it in all contexts or point
   previews at production credentials. Existing keys' scopes are not changed by
   a simple value update, so verify the actual scope/context after the change.
6. Check both OAuth discovery paths and the protected resource path documented
   in the MCP guide. An anonymous `/mcp` request must now return 401 with its
   resource metadata challenge; a generic 503 is not activation success.
   Check normal Google sign-in and sign-out still work.
7. Connect each real assistant using OAuth to the exact production `/mcp` URL.
   First prove scoped search/detail reads. Record actual account/connector
   eligibility and redirect behavior; local SDK tests do not establish these.
   A second Google account may need admission to the existing Testing audience
   under #44. Do not replace ownership checks or expose anonymous data to admit it.
8. Only after an explicit native-library decision, enable native writes for the
   one approved, verified user's existing library through a reviewed offline
   owner operation. Acquire the shared import gate `(73421,2)` followed by the
   library context lock `(73422, hashtext(library_id::text))` in one transaction.
   Confirm the exact user/library association under the locks and require one
   affected permission row with operator attribution and approval time. There
   is no runtime permission-management endpoint or global native-write flag.

## Acceptance to run with the owner

- In both ChatGPT and Claude, request an actual owner-selected new book or an
  update to an app-native book. Do not invent a test book in production without
  approval or copy private request/response contents into Git.
- For updates, read `version`, `feedbackVersion` and `writable` with `get_book`;
  pass the versions unchanged. Imported books must report `writable: false`.
- Prepare the proposal, review its exact stored values in the browser and
  explicitly approve. Calling MCP commit beforehand must not approve anything.
- Verify the receipt, reload the site and read the saved book in the assistant.
  Repeating the same request must not duplicate the write. A stale version must
  fail rather than overwrite newer feedback.
- Verify revoked/expired authorization and sign-out deny subsequent MCP calls.
  Tokens currently expire after one hour and require reconnection; refresh-token
  support is not implemented by this slice.
- Record sanitized pass/fail evidence, client restrictions and response timing.
  Do not close #27/#46 solely because deployment, tool discovery or reads work.

The imported library still belongs to the Sheet until cutover. This release can
allow new native books and updates to those native books; it does not authorize
editing imported records, retirement of the old site or silent dual-writing.
Those adoption limits must be explicit during today's owner review.

## Reversal without discarding new records

Disable the approved library's native permission through the same offline lock
order to stop browser and MCP writes. Disable the MCP flag and publish the
configuration change to end the assistant channel. Keep ordinary private reads
and Google sign-in available where possible.

Do not down-migrate, drop OAuth/proposal/native tables, rotate unrelated secrets,
restore a stale snapshot over new records or delete the branch. Already committed
native books and receipts remain durable. If returning to the old library,
reconcile app-native changes separately before claiming the old source is complete.
A recovery restore or Sheet modification is its own reviewed operation.
