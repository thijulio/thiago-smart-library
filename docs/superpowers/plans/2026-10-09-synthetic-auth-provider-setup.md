# Synthetic Auth Provider Setup Implementation Plan

**Superseded for execution on 2026-10-09:** [owner decision T-13](../../product/decisions.md#product-implementation-direction--2026-10-09)
requires product implementation using the existing Neon production database and Netlify site.
Do not create the spike projects/databases or apply this proposal's provider configuration.
The proposal below is historical context, not the current execution plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare isolated synthetic authentication infrastructure for the stable callback and trusted preview branches without touching library infrastructure or data.

**Architecture:** Two fresh Neon projects provide independent empty auth databases. Netlify exposes the dedicated Google credentials only to Functions on the two exact spike branches. Better Auth uses the stable branch for Google's callback and OAuth Proxy for the trusted preview.

**Tech Stack:** Neon PostgreSQL, Netlify Functions, Better Auth 1.7.7, Google OAuth Web application.

**Spec:** Owner's synthetic spike instructions and issue #27; repository boundaries in `AGENTS.md`, `docs/database/spec.md`, and `docs/database/plans/execution-contracts.md`.

**Status:** Review proposal only. No database resources, roles, schema, or environment variables were created by this setup review. This document grants no permission to execute hosted changes.

## Global Constraints

- Require explicit owner approval at the time of each Netlify/Neon change. Hosted SQL, deployment, pushing, imports, and cloning are outside this request.
- Preserve the old Google client/project, prototype site, production variables, and existing library databases.
- Never emit credentials or connection strings in chat, logs, screenshots, Git, frontend bundles, or build artifacts. The owner enters secret values privately.
- Use only synthetic auth records. No Sheet/Drive permissions or library data access.
- Never initialize or migrate a database during a Netlify build or function startup.
- Verify the spike's actual code and environment key names before wiring database connections. The spike README/NOTES were unavailable during this review.

## Review Focus

| Failure condition                                  | Required validation                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A library branch is cloned or reused               | New project creation starts fresh; source library project is never selected as a parent or copy source.      |
| Secrets reach production or other previews         | Both keys have only the two exact branch overrides and only Functions scope.                                 |
| An auth runtime can access another database        | Separate projects and separate restricted runtime roles; validate privileges on synthetic resources only.    |
| Preview bypasses OAuth Proxy                       | Google has only the stable callback; trusted preview uses the proxy and exact trusted-origin configuration.  |
| Configuration is mistaken for issue #27 acceptance | Report deployment, live owner/non-owner login, preview OAuth, ChatGPT/Claude, and latency checks as pending. |

---

## Verified Provider Metadata — 2026-10-09

- Netlify project: `thiago-smart-library`.
- Stable branch: `spike/nitro-mcp-auth`.
- Stable origin B: `https://spike-nitro-mcp-auth--thiago-smart-library.netlify.app`.
- Trusted preview branch: `spike-preview`.
- Trusted preview origin P: `https://spike-preview--thiago-smart-library.netlify.app`.
- Google project: `thiago-smart-library`; dedicated client: `Smart Library Synthetic Spike — Web`.
- Registered Google callback: `https://spike-nitro-mcp-auth--thiago-smart-library.netlify.app/api/auth/callback/google`.
- Existing Neon project `thiago-smart-library` has only `production` and `staging` branches. Each lists only `neondb` and `smart_library`; neither dedicated synthetic auth database exists.
- Inspection used project, branch, and database-name metadata. No library rows, table contents, SQL editor, or connection strings were accessed.
- Netlify currently disables custom scope selection and shows an upgrade requirement. The available selection includes Builds, Functions, and Runtime, so it does not meet the requested Functions-only boundary. Credentials remain unsaved.

## Task 1: Resolve Functions-Only Scope Availability

**Interface:** Netlify project configuration; no repository code changes.

- [ ] Owner enables a Netlify plan that supports custom scopes, or makes a separate explicit decision about credential storage. No plan upgrade is authorized by this document.
- [ ] Reopen the variable form and verify that Functions can be selected independently.
- [ ] Stop if Builds or Runtime cannot be excluded; do not save secrets under broader scopes.

Reference: [Netlify Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/) documents custom scopes for Pro and above and the need for a new deployment to use changed variables.

## Task 2: Enter Google Credentials Privately

**Interface:** Netlify environment-variable UI; owner supplies values directly.

- [ ] Create `SPIKE_GOOGLE_CLIENT_ID` and `SPIKE_GOOGLE_CLIENT_SECRET`, marking both as containing secret values.
- [ ] Select Functions only.
- [ ] Use different values per deploy context, with overrides only for `spike/nitro-mcp-auth` and `spike-preview`. Use the same dedicated Google client on both.
- [ ] Leave generic Production, Deploy Previews, Branch deploys, Preview Server, and Local development values unset for these keys.
- [ ] If either key already exists, inspect non-secret context/scope metadata first and preserve unrelated settings; resolve conflicting inherited values before saving.
- [ ] Verify key names, secret flags, scope, and exact branch labels without reading or revealing values.
- [ ] Do not trigger a deployment. Record that changed variables will take effect only in a subsequent separately authorized deployment.

## Task 3: Review Two Fresh Neon Projects

**Interface:** Neon project/database control plane; proposed names only.

| Purpose                     | Proposed project                    | Proposed database | Proposed runtime role  | Netlify branch         |
| --------------------------- | ----------------------------------- | ----------------- | ---------------------- | ---------------------- |
| Stable Google callback auth | `thiago-smart-library-spike-auth-b` | `spike_auth`      | `spike_auth_runtime_b` | `spike/nitro-mcp-auth` |
| Trusted preview auth        | `thiago-smart-library-spike-auth-p` | `spike_auth`      | `spike_auth_runtime_p` | `spike-preview`        |

- [ ] Verify the actual Netlify Functions region and choose a compatible Neon region before approval; do not assume the existing library project's Ohio region is appropriate.
- [ ] Review project quota and any cost before resource creation.
- [ ] Obtain explicit owner approval for these two fresh projects and their database/role configuration.
- [ ] Start each project with a fresh provider-created default branch. Never fork the library project, including schema-only cloning.
- [ ] Create the dedicated database through the supported control plane. Decide explicitly how to handle any provider-created default database; do not delete resources implicitly.
- [ ] Keep bootstrap/admin credentials in the owner's password manager. Never put admin credentials in Netlify.

## Task 4: Prepare Synthetic Schema and Runtime Access Separately

**Interface:** Future reviewed spike code and a separate hosted SQL approval; no SQL execution in this request.

- [ ] Locate the actual spike README/NOTES and confirm its Better Auth 1.7.7 adapter, schema, migrations, and environment keys.
- [ ] Prepare the smallest auth-only schema from that version and adapter. Do not include library tables, importer roles, or production grants.
- [ ] Prepare independent runtime roles limited to their own synthetic auth database/schema. Review the provider role defaults rather than assuming roles are restricted.
- [ ] Obtain a separate owner approval before applying any hosted schema or privilege SQL.
- [ ] Validate emptiness and privileges using approved metadata/count checks against the synthetic databases only; never open library data to prove isolation.
- [ ] Store each runtime connection privately under the exact environment key used by the spike code, Functions-only and only its corresponding branch. No fallback to a production connection.

## Task 5: Record Remaining Integration Gates

- [ ] Verify the server's owner-only restriction; Google's Testing audience/test-user list alone is not the application's authorization check.
- [ ] Confirm only identity scopes (`openid`, `email`, `profile`) are requested.
- [ ] Configure the proxy's shared secret privately and its trusted origin as P using the actual spike implementation.
- [ ] Keep P's Google callback absent from the Google client.
- [ ] Review and approve deployment separately when code and synthetic infrastructure are ready.
- [ ] Validate live owner acceptance and non-owner rejection, preview OAuth Proxy behavior, ChatGPT/Claude integration, and Netlify latency.
- [ ] Update issue #27 only with evidence for completed gates; Google configuration alone does not pass it.

## Current Handoff

The Google client exists. Netlify credentials are not saved because Functions-only scope is unavailable on the current plan. The two isolated auth databases do not exist. This plan is ready for owner review; creation, hosted SQL, code wiring, pushing, and deployment remain unexecuted.
