# DB-00 — Context and Execution Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` when available to implement this plan task-by-task. Otherwise follow the explicit sequential red/green checklist. Do not delegate unless requested.

**Goal:** Make the approved database work discoverable and portable without chat memory or access to the entire personal workspace.

**Architecture:** The context folder keeps raw study evidence; the repository becomes canonical for the sanitized implementation contract, executable plans, code, tests and delivery state. Routing files link instead of maintaining competing designs.

**Tech Stack:** Markdown, existing Node scripts, Git, existing Nx toolchain.

**Spec:** [Pack index](README.md), [execution contracts](execution-contracts.md), database spec §0 and §12.1.

## Global constraints

All index constraints apply. Documentation only; no credentials, source data, dependency installs, database connections, pushes or cloud changes in this ticket. User authorization for this ticket includes the specifically named routing documents, not unrelated workspace files. Do not modify `global Codex memories`.

## Review focus

Wrong branch; competing canonical copies; links that depend on iCloud absolute paths; sensitive fixtures promoted into Git; a plan mistaken for delivered code. Each is covered below.

## Task 00.1 — Establish the implementation workspace

**Files:** create `docs/database/status.md`; no product files yet.

**Consumes:** current Git state. **Produces:** recorded base SHA and ticket state.

- [ ] Run the preflight from the index. Save branch/HEAD and clean/dirty status without dumping credentials.
- [ ] Fetch `origin` and inspect `origin/main`. Confirm PR #3's connectivity code is an ancestor; use `git merge-base --is-ancestor 3841213f6db5ee8bf98620094e2a2ac10881b8ac origin/main` (exit 0 required). If history changed, inspect the replacement implementation and record why before proceeding.
- [ ] Create a new isolated branch `thijulio/database-context` from verified main through the available worktree workflow; use a different approved branch name if that one already contains user work. Never switch/reset the existing old branch.
- [ ] Write `status.md` with one row per DB-00…DB-05: `not-started|in-progress|implemented-local|reviewed|merged|deployed`. Start only DB-00 in-progress. Separate columns for test evidence, review, PR/head and environment; absent evidence says `not performed`, not `passed`.

## Task 00.2 — Promote a self-contained technical package

**Files:** create `docs/database/README.md`, `docs/database/spec.md`, `docs/database/plans/` containing this pack (including its single `execution-contracts.md`); create `docs/database/reference/prototype-contracts.md`.

**Consumes:** local study and this pack. **Produces:** repository-relative canonical documents.

- [ ] Copy only the technical contract and plan text into the named repo paths using approved file-edit tools. Do not copy XLSX, raw profiler output, local dumps, named personal review excerpts or private URLs containing credentials.
- [ ] In the promoted spec, replace personal example titles with synthetic examples when identity is not needed. Keep schema requirements and exact synthetic edge cases. Describe current data issues by code/count and observation date; the private source report remains outside Git.
- [ ] Integrate execution-contract rules into the canonical spec or explicitly give the addendum precedence. Fix the old import-run uniqueness key, source timestamps, field merges, child collections and current recap validator findings. Keep historical export counts labelled as historical, not accepted live invariants.
- [ ] Adapt all links to the repo layout. Canonical spec lives at `docs/database/spec.md`; this pack, including its one execution-contracts addendum, lives in `docs/database/plans/`. Replace this pack index's old `../spec.md` link with `../spec.md`. Top-level `docs/database/README.md` is a short router linking spec, plans/README, plans/execution-contracts and status; do not duplicate their contents. The original study link is provenance, not a required execution dependency for DB-01 tests.
- [ ] Record prototype commit `da23c6b98f9a029ab357f60691fc57f7bfe4f9d9`, module names (`src/recap-catalog.mjs`, `src/ranking-engine.mjs`, `src/ranking-scheduler.mjs`, `netlify/lib/ranking-core.mjs`), their roles, and the rule that code is ported with tests, not linked to an absolute runtime path. Pin file hashes when ports are actually performed.
- [ ] To avoid requiring later executors to access another checkout, capture those four code-only reference files from that exact commit into `docs/database/reference/prototype/`, preserving attribution/license and SHA-256. Use `git show <pinned-sha>:<path>` from the verified `thijulio/thiago-library` repository; if unavailable, retrieve the exact commit from its authorized GitHub remote. These are non-executable compatibility references, never private snapshot JSON. Inspect for embedded personal data/secrets before copying. Record retrieval failure as a DB-03/04 gate; do not silently substitute current HEAD. Downstream tickets consume these checked-in references.
- [ ] Do not promote the old schema.sql as executable. Link its existence as historical and state that versioned migrations will replace its implementation role.

## Task 00.3 — Repair entrypoints with one canonical owner

**Files:** modify repo `AGENTS.md`, `README.md`, `docs/architecture.md`; scoped context `AGENTS.md`, `README.md`, `memory.md`, and the old database study's authority header; create `docs/database/context-map.md`.

- [ ] Keep repo AGENTS short. Preserve language, Biome, toolchain, authority, and existing unrelated boundaries. Replace the blanket database-scope sentence with:

```markdown
## Task routing

- Start database work at `docs/database/README.md` and `docs/database/status.md`.
- Read the selected ticket and its named spec sections before editing code.
- Database implementation is limited to the ticket explicitly authorized by the user.
- Local implementation does not authorize real-data import, cloud changes, publication, merge, or cutover.
- Never execute the historical schema prototype or migrate during a Netlify build.
- Keep `libs/database` and `libs/importer` server-only; preserve the Nx dependency rules.
- Keep source exports, backups, detailed import reports, and credentials outside Git.
```

- [ ] Add a repo README “Database work” link to the database index and status. Do not copy a long roadmap into README.
- [ ] In architecture, distinguish current edges from the ticket-planned database/importer edges. Mark new edges implemented only when DB-01 actually adds their project configuration.
- [ ] In context AGENTS/README remove false present-tense claims of empty/unconnected repo; retain historical entries with their dates. Route current technical work through `repo/docs/database/README.md`; explain that `repo/` is a local symlink and GitHub readers use repository docs directly.
- [ ] Update project `memory.md` with verified state and plan link, not speculative delivered features. Preserve old milestones as dated history. This is the project's explicitly scoped state file, not vendor-managed global memory.
- [ ] Add a superseded-for-implementation header to the old context database study, linking `../repo/docs/database/spec.md` relative to its docs directory. Preserve historical body/evidence. Mark this original planning pack as the pre-promotion source and route future execution to the repository copy; do not continue editing two canonical plans.
- [ ] Write source-of-truth map:

| Information                      | Owner                                           | Rule                                    |
| -------------------------------- | ----------------------------------------------- | --------------------------------------- |
| Current approved DB requirements | repo `docs/database/spec.md` + addendum         | Changes reviewed with code impact       |
| Task execution/evidence          | repo `docs/database/status.md`, ticket handoffs | Evidence links, no secrets              |
| Original spreadsheet/study       | private context evidence folder                 | Read-only, not CI input                 |
| Current prototype records        | live Sheet until signed cutover                 | This pack never edits it                |
| Operational cloud state          | fresh provider/CLI evidence                     | Docs are dated observations             |
| Broad product intent             | context `docs/product-thesis.md`                | Repo includes a short technical summary |

## Task 00.4 — Add a deterministic context check

**Files:** create `tools/database/check-context.mjs`, `tools/database/check-context.spec.mjs`; modify `package.json` with `docs:database:check`.

**Interface:** `node tools/database/check-context.mjs` returns exit 0 with a count of checked links; exit 1 with relative path/line for broken required links or missing routing. No repository writes.

- [ ] Write node:test cases for missing required index, broken relative file link, valid anchor, nonexistent anchor, URL ignored without HTTP fetch, and code-fence pseudo-links ignored.
- [ ] Implement a bounded checker for README/AGENTS and `docs/database/**/*.md`. Ignore fenced examples, ordinary HTTPS links and optional historical private references; resolve repository-relative local links and Markdown heading anchors. Reject a required execution link resolving outside repo. Do not scan unrelated personal folders.
- [ ] Add these exact script entries:

```json
{
  "docs:database:check": "node --test tools/database/check-context.spec.mjs && node tools/database/check-context.mjs"
}
```

- [ ] Run `pnpm docs:database:check` and `pnpm format:check`. Correct only this ticket's formatting; do not reformat unrelated files.
- [ ] Fresh-context exercise: using only repo files, answer “chosen DB?”, “next ticket?”, “may I touch production?”, “may I run old SQL?”, “which test commands?” Each answer must have one canonical reachable source.

## Acceptance and handoff

- [ ] No application code/DB/cloud/source data changed.
- [ ] Canonical requirements reachable from repo AGENTS and README in at most two links.
- [ ] No private export, raw values, secret, or runtime dependency on local iCloud paths in the repository package.
- [ ] Status accurately says schema/importer not implemented.
- [ ] Run `git diff --check`; inspect exact changed paths and report checks.
- [ ] Prepare local commit description `docs: prepare database execution context`; commit only if that is part of the user's execution authorization. No push/PR/merge.
- [ ] Next ticket: DB-01. The specific SQL/privilege design needs review before accepting its implementation.
