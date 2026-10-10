# Automatic Schema Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a complete, public schema reference generated from Smart Library migrations, automatically updated from approved main commits.

**Architecture:** Offline tooling creates a guarded disposable PostgreSQL database, runs the existing migrations, reads catalogs and produces a curated static site. Pull requests validate downloadable artifacts; an approved GitHub Pages workflow publishes only main artifacts. The pipeline has no Neon connection or product credentials.

**Tech Stack:** Node 24, pnpm 10.19.0, TypeScript/tsx, existing pg 8.23.0, Vitest, Playwright, published @thijulio/biome-css 0.0.2, PostgreSQL 16.15/18.6 and GitHub Actions Pages.

**Spec:** [Owner-approved architecture](../../database/schema-reference-proposal.md).

## Global constraints

- Ticket #55, M0; independent from Reading #45. The owner approved this plan and selected Native execution on 2026-10-10.
- Never execute the historical schema prototype or edit applied migrations.
- Generate from a fresh empty disposable local/CI PostgreSQL target using existing local-test/synthetic-test guards; never accept a hosted URL.
- Cover auth, library, import_audit, db_meta and api_public, including bootstrap metadata and final ALTER effects. Fail on unrepresented project object families.
- Publish structural metadata and public-safe mapping only; no application records, real row counts, private exports/reports, hosted identifiers, database URLs or credentials.
- Label the page “repository schema at commit …”; never claim live production parity.
- Use published Biome CSS; no copied tokens/components, new AI calls or external diagram service.
- Keep tooling outside browser/server runtime imports. No migrations during Netlify builds or function startup.
- Main-only deployment, curated output and least privilege; initial Pages configuration/publication remains a concrete owner-approved action.

## Review focus

1. Later ALTER statements change columns/constraints: the reference must show the final catalog, not a SQL-text approximation (Task 1).
2. A future migration adds an object category: publication must fail rather than silently omit it (Task 1).
3. A synthetic private value, unexpected file or DDL markup enters generation: it must never leak into the site or execute as HTML (Tasks 1–2).
4. Project-site base paths, wide diagrams and keyboard/mobile use: navigation and SQL download must work under /thiago-smart-library/ (Task 2).
5. A PR, stale build or failed generation reaches deployment: only validated current main output may publish; failure preserves the previous site (Task 3).

## File structure and interfaces

Create the offline implementation in `tools/database/schema-reference/`:

- `model.ts`: typed public catalog model and metadata; no connection URLs or instance IDs in exported types.
- `provision.ts`: guarded disposable database lifecycle and same-instance schema dump.
- `catalog.ts`: project-schema inventory, definitions, relationships and project-role permissions.
- `render.ts`: static HTML, local SVG relationship diagram and local Biome asset packaging.
- `validate.ts`: model/rendered-output completeness and artifact boundary checks.
- `cli.ts`: orchestration, commit validation, output lifecycle and redacted failure reporting.
- `catalog.spec.ts`, `render.spec.ts`, `validate.spec.ts`: unit coverage registered in database Vitest configuration.

Create `libs/database/test/schema-reference.integration.spec.ts` for real PostgreSQL and `tools/database/schema-reference/site.spec.ts` for Playwright against generated files served at the project base path. Create dedicated Playwright configuration alongside the latter; keep product E2E configuration independent.

Modify `libs/database/{tsconfig.json,project.json,vitest.config.ts}` to include nested tooling in typecheck/lint/unit checks. Add `schema:generate` and `test:schema-ui` package scripts; ignore only generated `dist/schema-reference/` output. Create `.github/workflows/schema-reference.yml`; update documentation navigation with the live URL only after verified publication.

The shared `SchemaReference` model contains `sourceCommit`, `postgresVersion`, ordered `migrations: {name, checksum}[]`, `schemas: string[]`, `objects: SchemaObject[]` and `relationships: Relationship[]`. A `SchemaObject` has a stable qualified `id`, `kind`, `schema`, `name`, definition, catalog-derived details and project-role privileges. Details include column/type/nullability/default metadata where applicable; IDs for overloaded routines include identity arguments. Relationships link stable object IDs and preserve FK column order. This is structural metadata only.

Public interfaces:

- `withReferenceDatabase<T>(work: (client: SqlClient, dump: () => Promise<string>) => Promise<T>): Promise<T>` in provision.ts; it creates and disposes a fresh target, including on failure.
- `inspectReference(client: SqlClient, sourceCommit: string): Promise<SchemaReference>` in catalog.ts.
- `renderReference(model: SchemaReference, schemaSql: string, roadmap: string): Promise<Record<string, string | Uint8Array>>` in render.ts; keys are output-relative files, including index.html, schema.sql and local assets.
- `validateReference(model: SchemaReference, schemaSql: string, files: Record<string, string | Uint8Array>): void` in validate.ts; throws on completeness or publication-boundary failure.
- CLI: `pnpm schema:generate --source-commit <full-sha>`; fixed output `dist/schema-reference/`, no database/hosted argument. Source commit must match the checked-out tree. Errors print a stable failure code without SQL parameters, connection strings or raw provider errors.

## Task 1: Generate verified public structure from disposable PostgreSQL

**Files:** Create model.ts, provision.ts, catalog.ts, catalog.spec.ts and the integration spec; modify database test/typecheck/lint registration.

**Consumes:** Existing validateLocalTarget, localPool, assertMarker, migrate and bootstrap empty-target checks. Consult the current test harness lifecycle rather than duplicating or weakening its target/cleanup rules.

**Produces:** SchemaReference, withReferenceDatabase and inspectReference interfaces above.

- [ ] Write failing unit cases for qualified/overloaded IDs, ordered multi-column foreign keys, project-schema filtering and unsupported object-family rejection.
- [ ] Write real-PostgreSQL tests that run all migrations and assert db_meta.schema_migrations is present, user-library relationships exist, and ALTER additions match catalogs. Compare an independently queried inventory/relationship set to the model rather than a hard-coded total.
- [ ] Add a synthetic fixture containing a private marker in an application row; assert the marker never appears in serialized model or schema-only SQL. The production generator itself never seeds records or reads application rows.
- [ ] Verify that inherited DATABASE_URL and hosted targets are rejected before opening connections; test cleanup after callback/dump failure and rejection of mismatched instance markers.
- [ ] Run the new focused tests and record the expected failures before implementing the interfaces.
- [ ] Implement fresh database allocation using existing guarded admin validation and assertMarker; set synthetic-test purpose and run migrate against libs/database/migrations. Avoid creating application/login fixtures. Close clients and dispose only the recorded marked database in finally.
- [ ] Read pg_catalog for all project tables, columns, constraints, indexes, sequences, custom types, views, routines, triggers, security/search-path settings and project group-role privileges. Retain relevant definitions/comments as escaped display text. Do not read pg_authid or login credentials. Derive migration names/checksums from the repository bytes and verify against the disposable migration ledger; omit environment marker values and application rows.
- [ ] Implement schema-only pg_dump from the matching local/CI PostgreSQL container, with only project schemas and no ownership statements referring to disposable login roles. Local discovery uses the existing validated compose container; CI supplies its PostgreSQL service container ID. Validate its image/version and verify the disposable database marker matches the connected target before invoking its pg_dump. Do not accept an arbitrary dump command or connection URL. Include permissions in catalog output; the dump is not a cluster-role backup.
- [ ] Run `pnpm db:up`, focused unit tests via the database Vitest config and the new integration spec via its existing integration config. Expected: all assertions pass against PostgreSQL 16.15 locally and both CI versions later.
- [ ] Commit the tested catalog/lifecycle unit as `feat: generate public schema metadata from disposable PostgreSQL`.

## Task 2: Render and validate the standalone reference

**Files:** Create render.ts, validate.ts, cli.ts, their unit tests and the dedicated UI test/config; modify package scripts and generated-output ignore rules.

**Consumes:** Task 1 interfaces and the reviewed public mapping in docs/database/roadmap-schema-map.md.

**Produces:** A validated dist/schema-reference/ directory, CLI and UI check commands.

- [ ] Write failing render tests asserting the source commit/version, complete object navigation, FK diagram edges, column/constraint details, privileges and schema.sql download. Feed HTML-like synthetic names/definitions and assert escaped text, with no executable injected markup. For a definition containing `<script>private_fixture_marker</script>`, assert the HTML contains `&lt;script&gt;` and never the literal `<script>private_fixture_marker</script>`.
- [ ] Write failing validation cases for missing objects/relationships, unsupported file paths or symlinks, private fixture markers, connection-string material and unexpected files. Completeness uses the catalog model plus independent Task 1 inventory checks; do not promise that a regex can detect every secret.
- [ ] Implement an accessible static HTML reference with schema sections, searchable object navigation and local SVG relationship diagram with a text-link equivalent. Keep the reviewed future-work mapping visually labeled as planned; do not copy unrelated product/planning docs into the site.
- [ ] Resolve and copy only the required assets from the installed published Biome package. Render/draw locally without a CDN or external schema diagram service. Use relative links under /thiago-smart-library/.
- [ ] Implement CLI orchestration with fixed staging/output directories and a strict artifact file inventory. Validate everything before replacing a previously generated output. Include index.html, schema.sql, bundled assets and a public structural manifest; publish no raw logs or temporary files.
- [ ] Add package commands for tsx CLI and the dedicated Playwright config. Register new unit cases in pnpm check. Keep the product build and runtime graph unchanged.
- [ ] Generate output locally and run `pnpm test:schema-ui`. Assert keyboard links/search, diagram/text navigation, SQL download and no broken assets at the project prefix using desktop/mobile viewports. Assert visible repository-schema labeling and source commit.
- [ ] Run `pnpm check`, `pnpm test:db`, dedicated schema UI checks and existing `pnpm test:e2e`. Expected: exit 0, complete catalog and readable site; no product bundle includes the generator.
- [ ] Commit as `feat: render and validate the automatic schema reference`.

## Task 3: Validate PR artifacts and prepare main-only Pages automation

**Files:** Create .github/workflows/schema-reference.yml; modify schema tests/documentation where needed.

**Consumes:** Task 2 fixed output and commands.

**Produces:** Validated downloadable PR artifacts and a reviewable main-only deployment job.

- [ ] Write workflow-boundary tests for PR versus main dispatch, output-path restriction, missing build dependency, deployment permissions and publication enabled/disabled. Add a test that a failed build cannot select an older workspace artifact for upload.
- [ ] Configure PR/push-main/manual generation for migrations, bootstrap/target tooling, generator, public mapping, lockfile/Biome asset inputs and the workflow itself. Keep PR workflows in pull_request, never pull_request_target. Build jobs have contents/package read access only; do not expose product/Neon secrets.
- [ ] Reuse the existing synthetic PostgreSQL CI service/bootstrap pattern. Validate generation on 16.15 and 18.6; use 16.15 as the documented published artifact baseline. Upload successful PR builds as named downloadable artifacts, never Pages deployments.
- [ ] Prepare configure-pages/upload-pages-artifact/deploy-pages using reviewed pinned action revisions. Keep configure-pages in the approved publication path; PR generation must work before any Pages site is configured. Upload only dist/schema-reference/. Give pages:write/id-token:write only to deploy, with needs on validated build and github-pages environment.
- [ ] Require main and an explicit repository variable `SCHEMA_REFERENCE_PUBLISH == 'true'` for publication. Leave it unset until the final hosted approval. Manual recovery also requires main. Use a single Pages deployment concurrency group with cancellation and recheck current origin/main before deployment, so an obsolete artifact is skipped.
- [ ] Run workflow tests and the approved checks on the feature PR. Inspect the downloadable artifact and record its exact source commit, complete inventory and successful UI/DB evidence. No Pages setting or publication yet.
- [ ] Commit as `ci: validate schema artifacts and gate main Pages publication`; request one whole-branch review and owner approval for merge.

## Task 4: Owner-reviewed initial publication and handoff

**Files:** Update docs/database/README.md and schema-reference-proposal.md with verified publication evidence; keep #55 acceptance synchronized.

**Consumes:** Reviewed implementation PR and validated exact-commit artifact from Task 3.

**Produces:** Verified live schema reference and documented approved recurring main-only publication.

- [ ] Show the owner the exact artifact preview, proposed URL, public file inventory, workflow permissions, Pages environment and main-only recurring triggers. Request concrete initial Pages configuration/publication approval; do not treat this plan approval as hosted approval.
- [ ] After explicit approval, configure GitHub Pages source as GitHub Actions, confirm the main-only environment policy, and set SCHEMA_REFERENCE_PUBLISH=true. Dispatch the reviewed workflow on main; no Neon/Netlify change.
- [ ] Verify the successful deployment run, expected source commit, live project-base navigation/assets, diagram and schema.sql download. If publication fails, report the failure and keep the previous version/disabled setup; do not claim success from the build alone.
- [ ] Record the live URL, source commit and workflow evidence separately from local validation, review and merge. Update #55 acceptance based on evidence; close only after the reference and recurring workflow are verified.

## Execution review

This plan adds no implementation or hosted resources. Recommended execution is **Native**: implement the three tightly connected technical tasks in this session, with one independent whole-branch review before integration. Subagent-driven execution is also available, with a fresh implementer/reviewer per task. The owner reviews this plan and selects the method before code work starts.
