# DB-05 — Adoption, Recovery and Gated Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available. Complete local implementation first. External operations below require separately recorded approvals; a written runbook is not permission to execute it.

**Goal:** Make the database usable through a private owner CLI and an optional public catalogue, prove recovery, and prepare an explicitly approved transition from the Sheet.

**Architecture:** Private writes remain local CLI → narrow DB routines. Public HTTP reads use a separate view-only credential and an off-by-default feature flag. No private browser endpoint or new auth provider is introduced. Production deployment and canonical cutover are different gates.

**Tech Stack:** existing React/Biome UI, Netlify Functions, Neon HTTP driver for reads, pg for owner CLI, pg_dump/pg_restore, Vitest/Playwright/PostgreSQL.

**Spec:** database §9 and §11.3; execution contracts B/F/G; all predecessor acceptance checks.

## Global constraints / review focus

No automatic migrations/imports during build. No production credentials in previews/CI. Public field publication needs explicit consent. Main risks: broad credentials, search-based private leakage, failed restore, unsafe switchback after new DB writes, and mistaking a working SELECT 1 for migrated data.

## Task 05.1 — Private owner CLI

**Files:** `tools/database/{owner.ts,owner-input.ts}`; DB `src/owner-repository.ts`; tests `owner-cli.spec.ts` and `owner-cli.integration.spec.ts`; `docs/database/runbooks/owner-operations.md`.

**Consumes:** DB-01 versioned routines and DB-04 events. **Produces:** a usable operator interface, not an authenticated web editor.

- [ ] Implement subcommands `list`, `show`, `create`, `patch`, `feedback`, `assessment`, `archive`, `decision`, `undo`. Read only DB_OWNER_URL. `list` defaults to active records; `show` and private prose output require an explicit private `--out` file, never unsolicited stdout. Summary stdout contains only count/request/result status.
- [ ] Writes read JSON from `--input-file` with owner-only permissions, not command-line plaintext notes; require request UUID and expected version for existing-row changes. Input validation rejects unknown keys. Hash semantic payload and reuse same request ID on retry, including unknown commit outcomes.
- [ ] Schema examples (synthetic):

```json
{
  "requestId": "33333333-3333-4333-8333-333333333333",
  "stableId": "example-book",
  "expectedVersion": "1",
  "patch": { "status": "reading" }
}
```

For `create`, require title, ordered author references/names, platform and status; generated stable ID is returned in private output. `feedback` addresses its own expected version, including explicit `expectedVersion:null` for absent child creation. `assessment` supports accept/reject or explicit edit with its own version and reviewer from server identity, not a caller impersonation field.

- [ ] `decision` uses DecisionInput from DB-04; `undo` uses explicit target event UUID. For an ambiguous imported active pair, show active target IDs in an explicitly requested private output and require owner-selected undo operations; do not automatically erase historical votes.
- [ ] Each CLI operation acquires proper import/ranking locks through existing routines. Do not implement a second direct-DML write path bypassing checks. Connection errors/sensitive SQL values are sanitized; expected conflict exits 3, execution failure 4, usage 64.
- [ ] Integration tests cover CRUD-style operations without hard delete, stale version, repeated request, input file too broad permissions, invalid actor/key injection, private output path in repo rejected, and all writer invalidation requirements.

## Task 05.2 — Explicit public database views

**Files:** `libs/database/migrations/0009_public_views.sql`; domain `src/lib/public-library.ts`; DB `src/public-library.ts`; `test/public-privacy.integration.spec.ts`.

**DTO:**

```ts
export type PublicBook = {
  stableId: string;
  title: string;
  authors: string[];
  series: { name: string; volume: string | null } | null;
  genres: string[];
  platform: Platform;
  status: ReadingStatus;
  coverUrl: string | null;
  wordCount: number | null;
};
export type PublicBookPage = { items: PublicBook[]; nextCursor: string | null };
```

- [ ] Build `api_public.books` using explicit columns only: stable ID, title, ordered author names, safe series display/volume, genres, platform/status, validated cover, word count, active records only. Never expose surrogate IDs or source/raw/audit fields. `series_volume` serializes as decimal string.
- [ ] `api_public.recaps` exposes only active read books with valid verified/summary recap, approved prose/source fields and spoiler warning. No pending/deferred/needs_review prose or raw mapping fields. `api_public.rankings` exposes stable ID/rank/ready-or-stale metadata only; private strengths/errors/actors never appear.
- [ ] Views owned by a nonlogin trusted role; grant public_reader only usage/select on these explicit views. Revoke base schema access. Test effective permissions through an actual public login.
- [ ] Use a synthetic secret canary in notes/opinion/relevance/raw recap/actor. It must never appear in public rows, errors or search results. Public queries may filter only title, author or series; they cannot use private notes to change membership or order. New private column added in a test must not appear automatically.
- [ ] Archive/status/provenance validity updates must immediately affect view eligibility. No stale exposed recap after invalidation.

## Task 05.3 — Optional HTTP/UI read path, disabled by default

**Files:** `apps/api/src/functions/library.ts`, API tests; `libs/data-access/src/lib/library-client.ts`; `libs/ui/src/lib/library-list.tsx` and tests; actual web composition file discovered from `apps/web/src` before editing; `tools/build-api.mjs`, `netlify.toml`, browser tests.

**HTTP contract:** GET `/api/library?limit=20&cursor=...&q=...`; GET `/api/library/:stableId`. No public writes. Later recap/ranking routes are not required for initial catalogue publication; their safe views are tested and ready for explicit route contracts, not automatically exposed by wildcard routing.

- [ ] Implement `createLibraryHandler({enabled,repository})` factory for tests. If disabled return 404 before any DB call. Production factory reads `PUBLIC_LIBRARY_ENABLED` and `DATABASE_PUBLIC_URL` from the Netlify runtime environment; unit tests inject values. Never fall back to DATABASE_URL, owner or import credentials.
- [ ] Default export is modern Request→Response; export Netlify `Config` as required by installed types. Keep repository's Nx source path and esbuild output; do not relocate functions into a competing convention. Add exact catalogue rewrites BEFORE the existing `/api/*` 404 and SPA fallbacks. Preserve existing health routing unchanged.
- [ ] GET only; other methods return 405 with Allow GET. Unknown stable ID 404; invalid query 400; DB unavailable 503 `{error:'unavailable'}` without SQL/host/credentials. All function responses set `Cache-Control:no-store` during this release; do not rely on static netlify.toml headers for functions.
- [ ] Cursor is base64url JSON `{v:1,lastStableId:string}` validated strictly, with a 1 KiB max. Keyset sort by stable*id C collation, limit integer 1–100 default20. Parameterized SQL only. Search trimmed query max100 characters; escape `%`/`*` when using literal substring matching. No unbounded dump endpoint or arbitrary filter/column input.
- [ ] Reuse published Biome components and existing theme/accessibility patterns for a small read-only list/detail UI: loading, empty, unavailable and data states. Hide the catalogue affordance when feature disabled. Do not redesign the whole product, add an editor or embed private fallback JSON.
- [ ] Unit tests mock repository return values; HTTP boundary tests exercise real local routing with synthetic DB role credentials. Playwright verifies keyboard navigation, empty/error states, catalogue fields, no private canary in DOM/network, POST 405, unknown API still404, existing health endpoints.
- [ ] Build/bundle scan ensures browser artifacts contain no private canary, pg/exceljs modules, DATABASE\_\* values or importer code. Public URL configuration stays server-only.

## Task 05.4 — Backup and restore rehearsal tooling

**Files:** `tools/database/{backup.ts,restore.ts,libpq-env.ts}`; `libs/database/operations/role-grants.sql`; tests; runbook `docs/database/runbooks/backup-restore.md`.

- [ ] Implement wrappers `db:backup --target-manifest <file> --out <new-private-file>` and `db:restore --target-manifest <file> --input <private-backup>`; their --help explains destructive scope. Production URLs never appear as process arguments or logs. Parse the authorized direct URL into child-only libpq environment variables; use execFile/spawn argument arrays, never a shell-built command. Preserve required hosted TLS verification/channel binding; reject insecure downgrade.
- [ ] Target manifest includes environment (`local-test|staging|production`), approved hostname/database, database marker UUID, purpose, approving actor/time and operation. It contains no password. This records authorization evidence; its contents alone do not replace current user authorization.
- [ ] Backup uses compatible pg_dump custom format, `--no-owner --no-acl`, scoped application schemas `db_meta`, `library`, `import_audit`, `api_public`, and `--exclude-table-data=db_meta.environment`. Store source instance marker in the private sidecar manifest, not as target identity to restore. Store file SHA-256, tool/server versions, schema versions, source heads and safe aggregate counts too. Include private audit/baselines: without them future reimports are not equivalent.
- [ ] Restore is permitted only into a separately verified EMPTY disposable database. No `--clean` against an existing database, no default production target. Bootstrap roles, restore with no owner/ACL under the intended library_owner object-creating context, then apply idempotent `role-grants.sql` and check ownership/default privileges. The grant script is maintained from migrations and regression-tested for drift, not an independent schema definition.
- [ ] Bootstrap does not precreate restored application tables; only permission groups/schema ownership prerequisites. After restoring the empty environment table definition, insert the independently approved destination purpose/instance UUID; never copy a production marker into a staging restore. Ensure db_meta ownership and history restore are consistent. `pg_dump` excludes role globals, so role grants must be tested separately.
- [ ] Restore verification: exact stable IDs, canonical content digests, event payloads, baseline/source heads, all migration checksums, public deny tests, trusted function ownership/search_path, default privileges, and next native identity insert. A readable backup file alone is not a successful restore.
- [ ] Test restore after initial seed and after native updates; retry import after restore preserves native values. Backup failure must not truncate an existing backup; output uses a new file and atomic completion rename.
- [ ] Run local recovery drills with only synthetic data before cloud authorization. Document time actually measured, not promised RTO/RPO. No paid backup/branch entitlement is assumed.

## Task 05.5 — Hosted rehearsal gate (operational, not automatic)

Only perform after the user approves exact Neon target, use of real private data, and credential/backup storage. Record permission separately from code review.

- [ ] Inspect existing project/branch/database identity and PostgreSQL major, available roles, region and relevant limits using read-only provider tools. Do not print connection strings. If current major differs from tested majors, run local/CI suite on that major before proceeding.
- [ ] Create/use an approved **isolated** rehearsal branch/database; do not assume a new branch is empty or free of production data. Explicitly record whether it is empty or cloned, and never purge a cloned target without separate approval. Prefer empty schema target with synthetic test first.
- [ ] Provision named direct migration/import/editor/worker and pooled public read credentials with least privilege. Real credentials are created through private UI/secret storage, never committed SQL literals. Verify each actual login's current_user/session_user, grants and owner non-membership.
- [ ] Run doctor → migrations → synthetic permission check → approved real snapshot dry-run. Owner reviews issue counts/destructive deltas/freshness; no unresolved required identity/event failures may proceed.
- [ ] Apply scopes core → enrichment → events, rebuild rankings, verify, repeat each scope unchanged, then test one controlled update with synthetic rehearsal data only. Never change the live Sheet to create a test case.
- [ ] Back up and restore into a second approved isolated target. Repeat verification. No claims of production readiness without successful recovery evidence.
- [ ] If a Netlify preview is requested, configure preview-only safe synthetic staging credentials. A branch with real personal data is not automatically safe for arbitrary PR functions: never give untrusted preview code those credentials. Public-view permission is still required.

## Task 05.6 — Production/canonical cutover gate

Requires separate approval naming: destination DB, final export, publication fields (or explicitly none), writer freeze, operational owner, recovery evidence and rollback boundary. If browser feature parity is required, stop here for a separate authenticated UI plan; do not replace a working editor with an unapproved CLI-only workflow.

1. **Preflight:** accepted exact code SHA; CI/local/role tests passed; no drift between deployed function contract and migration versions; stable backups and tested restore; confirmed credential isolation. Keep public feature off.
2. **Freeze:** user pauses prototype writes and any rating/recap/automation writer. This pack does not silently modify the prototype to enforce the freeze. Obtain a fresh stable export; prove two reads match or capture under confirmed freeze. Record hash, effective time and user approval.
3. **Backup:** before any target changes, back up existing target if it holds data; record no-existing-data case explicitly. Do not assume provider free-tier point-in-time retention.
4. **Apply:** explicit production target manifest and human-approved operation; run migrations, dry-run, reviewed resolutions, then core/enrichment/events import. Rebuild rankings. On blocking failure stop; do not switch application reads.
5. **Verify:** IDs, row dispositions, source heads, permissions, stable replay, event equivalence, date precision and optional-field quarantine report. Test owner CLI read with the actual least-privilege credential. No synthetic record added to production just to prove writes unless separately approved.
6. **Adopt:** switch only the approved Smart Library read path and/or owner CLI to DB. Public flag remains off unless publication separately approved. Netlify merge/autodeploy occurs only after explicit merge authorization; migrations never piggyback on it. Verify deployed SHA and actual URLs, not just green CI.
7. **Canonical marker:** record UTC cutover time, final source hash, DB identifier, accepted SHA, active writer(s), backup/restore evidence and acknowledged limitations. After this marker, normal edits go to the DB owner CLI; imported source fields still use the reviewed merge policy, not blind overwrite.
8. **Readback:** verify real deployed catalogue only if enabled, existing `/api/health` and `/api/health/db`, application row-count summary via private verification, and absence of sensitive fields in public response. Health ping alone is insufficient.

### Failure and rollback matrix

| Point                                                       | Action                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration/import fails before switching reads               | Leave old prototype authoritative; retain failed audit, fix/review and retry same logical operation                                                                                                             |
| DB validated but no DB-only edits yet; new read path broken | Disable new read flag/roll back application deploy; old Sheet remains a usable rollback source                                                                                                                  |
| DB-only edits already exist                                 | Freeze DB writers; preserve new data in backup/export; reconcile those changes before any switchback. Never discard them by restoring the final Sheet snapshot                                                  |
| Public leak suspected                                       | Disable public flag/route immediately through approved incident operation, rotate exposed credentials if needed, preserve evidence and assess actual exposure; do not claim toggling flag removes cached copies |
| Ranking rebuild fails                                       | Keep cache explicitly stale and retry ranking only; do not rerun canonical import blindly                                                                                                                       |

## Done and completion report

- [ ] Local completion: owner CLI, optional public path, privacy tests, backup/restore drill and all `pnpm check`, `pnpm test:db`, `pnpm test:e2e` checks passed. External work can remain explicitly unperformed without mislabeling local code as production delivery.
- [ ] Hosted completion: report staging and production separately, exact verified SHA, migration set, source hash, issue counts, backup/restore outcome and which writer/read paths actually changed.
- [ ] Cutover completion requires the canonical marker and owner acceptance of the available workflow. “Code merged”, “DB connected”, “seed applied” and “Sheet retired” are four different states.
- [ ] AI/RAG, auth-provider selection, private browser editing, full prototype UI parity and automated continuous synchronization are outside this plan. They are not hidden incomplete tasks in the database ticket.
