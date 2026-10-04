# Local synthetic PostgreSQL

Use Node 24 and pnpm 10.19.0. Install with `pnpm install --frozen-lockfile` using authorized
package-read access for the published Biome packages. Never substitute their implementations.

`pnpm db:up` starts only Compose project `smart-library-db-test`, service `postgres`, PostgreSQL
16.15, with tmpfs storage. It binds **127.0.0.1:55433**: port 55432 was already occupied by an
unrelated container during delivery and was preserved. No production volumes are mounted.
`pnpm db:down` verifies container identity and the synthetic marker, then destroys only this
project's disposable data. Never use Docker prune to clean this harness.

`pnpm test:db` requires a ready PostgreSQL server. It creates an independently named
`smart_library_test_<hex>` database per suite, migrates it, and connects as six distinct
synthetic logins. It never resets public schemas. Cleanup verifies the recorded instance UUID,
closes connections, and drops only the recorded database; it does not forcibly terminate pooled
connections. Bootstrap failure cleanup is limited to the exact database just created by that call.
No unavailable-server or missing-marker case is converted to a skipped passing test.

The default test URL contains only disposable synthetic credentials. An explicit
`DB_TEST_ADMIN_URL` must use loopback and the exact synthetic name pattern. Inherited
`DATABASE_URL` is rejected before connecting; the test harness never falls back to an import,
owner, public, or diagnostic credential. Query-string connection overrides are rejected.
Hosted migration/bootstrap is deliberately unavailable in this local delivery.

For a marked synthetic target, set **DB_MIGRATION_URL explicitly in the local shell** and run:

```sh
pnpm db:doctor --target local-test
pnpm db:status --target local-test
pnpm db:migrate --target local-test
```

These print sanitized role/version/marker or migration names/checksums, never the connection URL.
A marked empty target can be initialized; an unmarked existing target fails closed. CI marks
its empty synthetic admin service using `bootstrap-test.ts --target local-test --purpose synthetic-test`.
Only the bootstrap adapter sets the purpose; no hostname implies a production purpose.
`--help` is available for each command. Unknown flags fail before SQL mutation.

Migrations are forward-only: four-digit contiguous prefixes, immutable UTF-8 bytes, SHA-256
checksums, one direct checked-out client, session lock `(73421,1)`, one transaction per file.
Earlier committed files survive a later failure. Drift/unknown/gapped history is rejected before
pending SQL. Never migrate on HTTP startup, build, or deploy. `db:status` reads without DDL.
No down migrations, imports, backups, or hosted rehearsals are delivered here.

Owner operations use the shared transaction gate `(73421,2)`, then request and parent locks.
Only importer apply will take the exclusive gate; regular writes use its shared variant.
Lock timeout is 5 seconds and statement timeout 30 seconds. `withTransaction` retries only known serialization/deadlock errors, at most twice with 25–75 ms jitter. Validation/conflict/uniqueness and failed rollback/unknown commit outcomes are not retried. Callbacks must reuse their original request identity and avoid non-transactional side effects. Owner SQL is invoked through
server adapters; `createBook` and `patchBook` parse HTTP(S) URLs before SQL, without fetching.
Do not catch TLS errors and retry insecurely. All current connection adapters reject hosted targets.

Native create requires `title`, `platform`, `status`, and ordered `author_ids` referencing existing
lookups; optional `genre_ids` is a set. New stable IDs are server UUID strings. Stable ID is never
patchable. Patch accepts only the fixed column/relation allowlists, never audit/version/actor keys.
Completion and series changes must form a valid final row. Feedback and assessment expected versions
are independent; NULL means an absent child only. Content replacement clears assessment review.
`session_user` is the provisioned login identity, never a JSON actor claim. Request IDs are caller
UUIDs, reused on an unknown outcome; same normalized request returns its original result.

The SQL provenance hash domain is `pg-jsonb-text-v1`. Call `library.value_hash` with the logical
field type for verification: exact numerics/bigint values use normalized decimal strings. Do not
compare these bytes with JavaScript JSON serialization. Snapshot/config hashes in DB-02 have their
own serializer domain. The owner-request table is private and stores only payload digest/result,
never the original private payload.

Run `pnpm test`, `pnpm test:db`, `pnpm check`, and `pnpm test:e2e`.
The separate database workflow repeats SQL tests on 16.15 and 18.6. CI execution itself is a separate
state from validating those majors locally. Keep real exports, logs, credentials and backups outside
Git. All committed fixtures are synthetic. SQL/permissions require independent review before DB-02.
