# Automatic schema reference

Implementation tracking: [#55](https://github.com/thijulio/thiago-smart-library/issues/55).
[Architecture](schema-reference-proposal.md) and
[execution plan](../superpowers/plans/2026-10-10-schema-reference.md).

The generator describes the **repository schema at its source commit**, not the
applied production schema. It never connects to Neon. Initial Pages configuration,
publication and recurring automation enablement remain pending owner approval.

## Local generation

Use Node 24 and pnpm 10.19.0. From a clean committed checkout:

    pnpm db:up
    pnpm schema:generate --source-commit "$(git rev-parse HEAD)"
    pnpm test:schema-ui
    pnpm exec tsx tools/database/schema-reference/serve.ts

Open http://127.0.0.1:8891/thiago-smart-library/. Stop the preview before running
the UI tests again; they reserve that port themselves.

Generation creates a fresh marked database, applies all migrations and cleans
it up. The existing disposable admin container remains available for tests.
The output is ignored at dist/schema-reference/ and contains exactly:

- index.html: relationship diagram, linked objects, searchable definitions,
  column/constraint/index details, permissions, checksums and planned mapping.
- schema.sql: schema-only pg_dump from that same disposable instance.
- schema.json: structural catalog manifest stamped with source commit.
- assets/biome.css: published Biome CSS.
- assets/reference.css and assets/reference.js: layout and local search.

No application records are read. Unknown schema object families fail generation
rather than being silently omitted. PR artifacts are downloadable previews;
no PR deployment, product secrets, hosted DB credentials or private exports.

## Proposed publication setup

Use the existing public repository and GitHub Actions as the Pages source.
Default URL: https://thijulio.github.io/thiago-smart-library/ (not published yet).

Builds validate PostgreSQL 16.15 and 18.6; the published artifact uses 16.15.
Relevant PR changes trigger validation. Every main push rebuilds the reference
so a later unrelated commit can replace an obsolete in-flight build. Main deployment also requires SCHEMA_REFERENCE_PUBLISH=true.
Leave that variable unset until the owner reviews the artifact and explicitly
approves initial Pages settings/publication and recurring main-only updates.

The deploy job depends on both successful matrix builds, revalidates the curated
artifact, rejects obsolete commits and has narrowly scoped Pages permissions.
Failures cannot deploy leftover output; manual main rebuild supports recovery.
Neon's applied migration status remains a separate operational record.
