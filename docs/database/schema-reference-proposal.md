# Automatically generated database reference — design proposal

Date: 2026-10-10. Status: **architecture approved by the owner; implementation and initial publication pending**.

## Request and verified starting point

The owner requested a project page containing the full schema that updates
automatically, and clarified **GitHub Pages**. Repository
`thijulio/thiago-smart-library` is currently public; the authenticated Pages API
returned 404 with repository admin permission, indicating no configured Pages
site at this check. No Pages setting, workflow or hosted database was changed.

The repository already has immutable migrations 0001–0006, a guarded disposable
PostgreSQL harness and CI on PostgreSQL 16.15 and 18.6. Reuse those contracts;
never execute the historical schema prototype. See the
[roadmap/schema mapping](roadmap-schema-map.md) for existing versus planned work.

## Recommended setup

- Repository: the existing Smart Library repository.
- Site: a public schema-only reference at the default project Pages address,
  `https://thijulio.github.io/thiago-smart-library/` (proposed, not live).
- Source: committed migrations plus required bootstrap metadata definitions.
- Database for generation: a fresh empty disposable local/CI PostgreSQL target,
  guarded by the existing local-test/synthetic-test validation. Do not accept an
  arbitrary database URL or use a provider resource.
- Build: apply the real migration runner, inspect PostgreSQL catalogs and
  render a static reference. Add a schema-only SQL download generated from this
  disposable target. No imports or seed library/auth records.
- Publish: GitHub Actions Pages artifact, explicitly limited to generated site
  output. Never publish the entire repository or private planning workspace.
- Hosting: GitHub Pages only for this reference; Netlify continues hosting the
  product. No Neon connection, new Neon project, clone or production credential.

## Content and completeness

The reference includes:

1. A linked relationship diagram, grouped by project schema.
2. All implemented tables/columns, PostgreSQL types, nullability and defaults.
3. Primary/foreign/unique/check constraints, indexes, sequences and custom types.
4. Views, function signatures/definitions and triggers, including the ownership
   read boundary.
5. Schema/object privileges for project role groups, function security mode and
   search paths; exclude cluster logins and credential material.
6. Ordered migration names/checksums, source Git commit and PostgreSQL version.
7. A public-safe feature-to-schema mapping linking existing structures to planned
   tickets. Future entities remain clearly labeled proposals.

Cover `auth`, `library`, `import_audit`, `db_meta` and reserved project schemas
such as `api_public`; exclude PostgreSQL system catalogs and unrelated namespaces.
Keep bootstrap metadata in scope so the migration ledger is not accidentally
omitted. Permission details come from generated project metadata; a schema-only
dump must not be mistaken for a complete cluster role/credential backup.

Use the published Biome CSS for presentation without copying tokens/components.
Render diagrams locally or bundle the renderer; site visitors should not send
schema metadata to an external diagram service. Escape catalog text/DDL in HTML.

## Update behavior

Pull requests changing schema/bootstrap/generator inputs build and validate a
downloadable preview artifact; they never deploy Pages or connect to Neon.
Changes to the public mapping/template/workflow also trigger generation checks.

After an owner-approved main merge, the approved Pages automation rebuilds the
reference from that exact main commit and deploys only the validated artifact.
Use deployment concurrency, a main-only deployment condition and the standard
Pages environment. Provide manual rebuild for recovery without schema changes.
Grant `pages: write`/`id-token: write` only to deployment; build has only the
repository/package read access it needs. Pin/review action versions at execution.

The page updates with **merged repository schema**, not unapproved PRs or direct
Neon changes. Its visible label must say “repository schema at commit …” and
must not claim to describe the current production database. Migration deployment
evidence may be linked separately; live drift detection is a separate owner-
authorized feature, not an implicit scheduled production connection.

## Publication boundary

Publish structural metadata and public-safe mapping only. No book rows, personal
feedback, user/session/account records, import row/report contents, source
snapshots, counts derived from real records, environment/target identifiers,
database URLs, tokens or login-role passwords. The generator reads catalogs,
not application rows. Public artifacts are tested for prohibited output.

The initial review must cover this public scope and the recurring main-only
documentation deployment. Product deployment, hosted SQL/imports and canonical
cutover remain separate actions. Credentials for the product are never available
to this workflow; a private npm package-read token does not authorize database
access and must not appear in output.

## Validation and failure behavior

- Generate from fresh PostgreSQL with all committed migrations; reconcile object
  inventory, relationship edges and SQL download against the actual catalogs.
- Verify columns/constraints added by ALTER statements appear in final form;
  parsing CREATE TABLE text alone is insufficient.
- Verify links, project-site base path, readable diagram/table navigation and
  keyboard/mobile layouts.
- Use synthetic cases to verify escaping, absence of row values/credentials and
  restriction to the generated output directory.
- Fail publication on migration, completeness or content validation failure;
  retain the previously published reference, visibly stamped with its commit.
- Run the appropriate repository checks, real-PostgreSQL generator tests and
  documentation UI checks. No paid AI calls are involved.

## Alternatives considered

- A hand-maintained diagram is initially cheaper but drifts as ALTER statements
  and new migrations land; it does not meet the requested automatic reference.
- Introspecting production could show applied drift but requires hosted access
  and credentials in an additional workflow. It is unnecessary for the requested
  migration-driven reference and is outside this proposal.

## Next stage

Implementation tracking: [#55](https://github.com/thijulio/thiago-smart-library/issues/55),
M0, Todo on Libraries; independent from the Reading delivery sequence.

The owner approved this architecture and public content boundary on 2026-10-10
and explicitly authorized merging the planning PR. Next, write and review the
concrete implementation plan. No generator, new dependencies, Pages workflow,
hosted settings or publication is implemented by this document. Initial hosted
configuration/publication remains a separate action approval.

## References checked on 2026-10-10

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
  and [custom Actions workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [PostgreSQL schema-only dump](https://www.postgresql.org/docs/16/app-pgdump.html):
  object definitions without table data; introspected catalog metadata supplies
  the interactive reference.
