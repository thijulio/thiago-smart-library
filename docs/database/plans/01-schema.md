# DB-01 — Isolated Core Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available. Execute sequentially; write failing tests before product code. Do not delegate unless requested.

**Goal:** A repeatable, privilege-tested PostgreSQL foundation with no real records or hosted changes.

**Architecture:** Forward-only SQL migrations plus a small checksummed runner; synthetic disposable PostgreSQL tests. Schema constraints protect identity and relations; narrow routines protect owner edits. No import normalization or HTTP feature yet.

**Tech Stack:** Node 24, pnpm 10.19.0, pg 8.23.0, tsx 4.23.15, Vitest, SQL, Docker Compose.

**Spec:** execution contracts B/F/G; database spec §2–§4, §7, §9, §11.1 and §12.

## Global constraints and review focus

All pack constraints apply. No Neon connection, private data, pgvector, ORM, public API or production DDL. Focus: unsafe target selection, partially applied SQL, altered applied migrations, nullable-CHECK loopholes, role leakage and non-atomic versions. Tests below must exercise actual PostgreSQL.

## Task 01.1 — Server-only projects and isolated test harness

**Files:** create `libs/database/{project.json,tsconfig.json,vitest.config.ts,vitest.integration.config.ts,src/index.ts}`; `libs/domain/src/lib/database-contracts.ts`; `tools/database/{compose.yaml,local.ts,run-integration.ts,cli.ts,tsconfig.json}`; `libs/database/test/{harness.ts,fixtures.ts}`. Modify root package/lockfile, TS aliases, ESLint edges and `.gitignore`.

**Interfaces:**

```ts
export type SqlClient = Pick<import('pg').PoolClient, 'query'>;
export type BookId = string; // internal bigint over the JS boundary
export type StableBookId = string;
export type ReadingStatus = 'read' | 'wishlist' | 'unread' | 'reading' | 'paused';
export type Platform = 'Audible' | 'Kindle' | 'Physical' | 'Unknown';
// Test harness, not runtime exports:
export async function createTestDatabase(): Promise<{
  owner: import('pg').Pool;
  importer: import('pg').Pool;
  editor: import('pg').Pool;
  publicReader: import('pg').Pool;
  privateReader: import('pg').Pool;
  dispose(): Promise<void>;
}>;
export async function insertBookFixture(
  client: SqlClient,
  options?: {
    stableId?: string;
    title?: string;
    status?: ReadingStatus;
  },
): Promise<{ id: BookId; stableId: StableBookId; version: string }>;
```

- [ ] Install exact planned pg/types/tsx dependencies. These are implementation steps, not commands already executed by the plan author.
- [ ] Add database Nx tags and edges exactly as execution contract B. Model normal unit targets on `libs/domain`; integration tests use a separate config with `fileParallelism:false`, 30-second per-test timeout, and `*.integration.spec.ts` only. Unit config explicitly excludes integration tests.
- [ ] Add script map:

```json
{
  "db:up": "tsx tools/database/local.ts up",
  "db:down": "tsx tools/database/local.ts down",
  "db:migrate": "tsx tools/database/cli.ts migrate",
  "db:status": "tsx tools/database/cli.ts status",
  "db:doctor": "tsx tools/database/cli.ts doctor",
  "test:db": "tsx tools/database/run-integration.ts"
}
```

- [ ] Compose: project `smart-library-db-test`, image `postgres:16.15`, bind only `127.0.0.1:55432:5432`, DB `smart_library_test_admin`, synthetic user/password `sl_test_admin/sl_test_local_only`, healthcheck `pg_isready`, tmpfs database storage and no production volume mount. Document that down destroys only synthetic disposable test data. `db:down` validates this exact project/service before stopping it, never a broad Docker prune.
- [ ] `run-integration.ts` injects the local synthetic admin URL if unset; an explicit URL must pass `hostname ∈ {localhost,127.0.0.1,::1}` and database name prefix `smart_library_test_`. Reject inherited `DATABASE_URL`/Neon hosts before any connection. Host restriction is necessary but not sufficient: require database marker `purpose='synthetic-test'` after bootstrap.
- [ ] Harness creates an allowlisted random `smart_library_test_<hex>` database, migrates it, creates distinct synthetic role logins, and records the exact name. Cleanup only that recorded database; refuses arbitrary names and never drops the admin DB. Use a fresh database per integration file or suite; no destructive public-schema reset.
- [ ] Add safety tests with remote URL, pooled host, wrong local DB name, missing marker, and unrelated environment variables. Each must fail before mutation.

## Task 01.2 — Migration runner and role bootstrap

**Files:** `libs/database/src/{connection.ts,migrate.ts,target.ts}`; `libs/database/migrations/0001_bootstrap.sql`; `libs/database/src/migrate.spec.ts`; `libs/database/test/migrate.integration.spec.ts`.

**Interfaces:**

```ts
export async function withTransaction<T>(
  pool: import('pg').Pool,
  work: (client: SqlClient) => Promise<T>,
): Promise<T>;
export async function migrate(
  client: SqlClient,
  directory: string,
): Promise<{
  applied: string[];
  unchanged: string[];
}>;
```

- [ ] Red test first: two runner invocations create the history exactly once; second returns no applied names. Next, alter bytes of an already applied file and expect `MIGRATION_CHECKSUM_MISMATCH`, without executing changed SQL.
- [ ] Runner accepts only filenames matching `^\d{4}_[a-z0-9_]+\.sql$`, lexically ordered, unique numeric prefix. Compute SHA-256 over exact UTF-8 bytes. Reject a database history with unknown names, gaps relative to the selected directory, or mismatching checksums.
- [ ] Hold session advisory lock `(73421,1)` on a single **direct** client. Bootstrap `db_meta.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`. For each new file: BEGIN → execute file → insert history → COMMIT; on error rollback and stop. Release lock/client in finally. No hidden DDL on HTTP startup.
- [ ] Explicitly reject pooled hosts and missing migration env. Local synthetic target is allowed; any hosted target requires a target manifest plus separately granted permission, not `--force`.
- [ ] Bootstrap schemas and NOLOGIN permission groups, including actual owner-role ownership. A preexisting same-name role with unexpected LOGIN/SUPERUSER/CREATEROLE/BYPASSRLS properties fails inspection rather than silently adopting it.
- [ ] Transfer the bootstrap db_meta schema/history objects to library_owner in 0001. Create `db_meta.environment(singleton boolean PRIMARY KEY CHECK(singleton), instance_id uuid NOT NULL UNIQUE, purpose text NOT NULL CHECK(purpose IN ('synthetic-test','staging','production')))`. Bootstrap obtains the approved purpose from the validated target, never infers production from a hostname. Harness-created empty DBs are marked synthetic-test; later operations verify marker and recorded instance UUID before destructive cleanup/restore. Production initialization requires an explicit empty-target approval.
- [ ] Revoke PUBLIC schema/routine access; set default privileges **for library_owner**, the actual creating role, so new functions are not executable by PUBLIC. Use `SET ROLE library_owner` for domain migrations after administrative bootstrap. Never create real passwords inside migration SQL.
- [ ] Tests: invalid migration midway rolls back its objects/history; previously committed migration remains; concurrent runners execute each once; connection loss leaves no false applied record; runner reports status without changing schema; missing permission fails closed.

## Task 01.3 — Core SQL and invariants

**Files:** `0002_import_audit.sql`, `0003_core_library.sql`, `0004_owner_operations.sql`; `libs/database/test/{core,dates,roles,writes}.integration.spec.ts`.

**Produces:** tables in the spec plus addendum, no inferred extra entities.

| Migration | Objects and requirements                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0002      | import_runs/rows/issues, source_heads, field_baselines; explicit FKs, updated scoped replay key, private grants                                          |
| 0003      | authors/aliases, series, genres, books, book_feedback, book_assessments, book_authors, book_genres, book_field_provenance; constraints/indexes from spec |
| 0004      | trusted create/patch/archive routines, version and attribution updates, immutable stable IDs, deferred author-existence trigger                          |

- [ ] Translate every column in spec §3/§4 literally, applying addendum changes. Include private source audits and independent feedback/assessment `row_version`. Do not collapse these back into books.
- [ ] Use unconstrained `numeric` plus range/scale checks for rating/relevance where SQL must reject excess decimal precision; PostgreSQL `numeric(p,s)` rounds before CHECK. This is an intentional enforcement refinement of the spec. Tests assert 4.55 cannot silently become 4.6 for a one-decimal rating. Reject NaN/infinity and overflow.
- [ ] Implement strict date-precision CHECK with explicit NULL handling. Example structure:

```sql
CHECK (
  (finished_precision = 'unknown' AND finished_from IS NULL AND finished_to IS NULL)
  OR
  (finished_precision <> 'unknown' AND finished_from IS NOT NULL
   AND finished_to IS NOT NULL AND isfinite(finished_from) AND isfinite(finished_to)
   AND finished_from <= finished_to)
)
```

Add named checks for day equality, full calendar month/year, and distinct ordered range endpoints. The above is only the null/bounds component, not the complete constraint.

- [ ] Protect stable_id on UPDATE and forbid blank/`::` values. Retain legacy slugs. Add deferred constraint trigger for ≥1 author on inserted book and author-link insert/delete; lock affected parents before link mutations. Require unique author positions and IDs per book; zero genres allowed.
- [ ] Enforce review-state consistency; accepted/rejected assessments require reviewer/time; replacement resets review. Provenance hashes are 64 lowercase hex with `hash_version` from addendum D; field names come from a fixed allowlist. Implement the shared SQL value-hash function there and use it for both mutation and verification. Importer/writer updates value+provenance in the same transaction; never allow client-supplied SQL column names.
- [ ] Add all FK indexes listed in spec only where not covered by a PK/index prefix. All hard deletion remains denied/RESTRICT except expressly derived recap children added later.
- [ ] `library.create_book(payload jsonb, request_id uuid)` returns id/stable_id/row_version; new native IDs are UUID strings. Persist operation idempotency in `library.owner_requests(request_id uuid PRIMARY KEY, operation text, payload_sha256 text, result jsonb, created_at timestamptz)`; same request+payload returns original result, conflicting payload fails. Hash normalized semantic payload, excluding server times. No private payload copied into generic logs.
- [ ] `library.patch_book(stable_id text, expected_version bigint, patch jsonb, request_id uuid)` and corresponding `patch_feedback`/`patch_assessment` validate fixed writable keys, lock parent, compare version, update only changed values and provenance, return new/current version. For an absent feedback/assessment child, expected_version must be NULL and create version 1; a non-NULL expected version on absent child, or NULL on existing child, returns VERSION_CONFLICT. Actor is `session_user` mapped by provisioned identity, not an arbitrary JSON claim. `library.archive_book(stable_id text, expected_version bigint, request_id uuid)` sets archived_at and retains history. No SQL text assembled from user keys.
- [ ] SECURITY DEFINER functions are owned by library_owner, use `SET search_path = pg_catalog, pg_temp`, schema-qualified references and no public execute. Grant editor only required EXECUTE; public reader gets no base-table access. Private reader gets explicit named read grants. Importer gets only current scope DML/read and sequence permissions required by the controlled importer, not DDL or TRUNCATE.

### Required executable tests

```ts
it('retains a slug identity while title changes', async () => {
  const db = await createTestDatabase();
  try {
    const book = await insertBookFixture(db.owner, {
      stableId: 'legacy-book',
      title: 'Before',
    });
    await db.editor.query('SELECT library.patch_book($1,$2,$3::jsonb,$4)', [
      book.stableId,
      book.version,
      JSON.stringify({ title: 'After' }),
      crypto.randomUUID(),
    ]);
    const r = await db.owner.query('SELECT stable_id,title FROM library.books WHERE id=$1', [
      book.id,
    ]);
    expect(r.rows[0]).toEqual({ stable_id: 'legacy-book', title: 'After' });
  } finally {
    await db.dispose();
  }
});
```

`insertBookFixture` creates an author and link in the same transaction. Use synthetic defaults `Example Book`, `Example Author`, `Unknown`, `unread`, actor from the test login. It must never disable constraints to simplify tests.

- [ ] Duplicate/blank stable ID; book without author at COMMIT; duplicate author position; missing FK; series volume without series; numeric overflow/nonfinite/extra precision all fail.
- [ ] Day/month/year/range/unknown round-trip; impossible dates or NULL half-bounds fail; no timezone shift.
- [ ] Two clients with same expected version: exactly one differing update succeeds, other returns `VERSION_CONFLICT`; a same-value patch does not bump version. Feedback update does not bump assessment version.
- [ ] Public reader cannot SELECT base/audit/provenance, write, create objects or execute owner functions. Editor cannot direct UPDATE/DELETE/TRUNCATE. Runtime login cannot SET ROLE owner. Test newly created function default privileges as owner.
- [ ] Explicit malicious extra JSON key (`updated_by`, `row_version`, SQL-like key) rejected, not ignored. Required URL validation rejects javascript/data schemes; hosted TLS failures never trigger insecure fallback.

## Task 01.4 — CI and reproducibility

**Files:** `.github/workflows/database.yml`, `docs/database/runbooks/local-development.md`, `docs/architecture.md`, test harness documentation.

- [ ] Add a separate CI job with PostgreSQL service matrix 16.15/18.6, local synthetic credentials, `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:db`. Do not expose Netlify/Neon credentials. No private XLSX artifacts.
- [ ] `pnpm check` includes new projects' unit/type/lint targets. Integration suite remains separately explicit and required by the DB workflow; no passing-by-skip when PostgreSQL is absent.
- [ ] Run `pnpm db:up`, `pnpm db:doctor --target local-test`, `pnpm test:db`, `pnpm check`, `pnpm test:e2e`. `doctor` reports sanitized role/server-version/database-marker only, never URL/password.
- [ ] Capture exact image digest, PostgreSQL versions, test command results, schema migration names/hashes and role matrix in handoff. Failure to run Docker is a blocker for DB verification, not permission to claim mocked success.
- [ ] Before review, `git diff --check` and scan changed files for production hosts/secret patterns/private data. Confirm browser bundle has no pg/exceljs/database/importer code.

## Done / next

Done means a blank local database migrates, repeat migration is a no-op, all actual SQL/privilege tests pass, existing app tests remain green, and no live connection/import occurred. Prepare commit description `feat(database): add isolated core schema and migrations`. Stop for SQL/privilege review; DB-02 can start only from the accepted DB-01 implementation.
