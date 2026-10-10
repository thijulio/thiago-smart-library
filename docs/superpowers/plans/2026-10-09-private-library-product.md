# Private library implementation

Spec: `docs/superpowers/specs/2026-10-09-private-library-product.md`.

Implement inline in the existing checkout on `thijulio/private-user-library`.
Preserve pre-existing documentation edits. Do not push, deploy, or modify hosted
resources. Use synthetic fixtures only. Record checks and decisions in the
ignored execution ledger.

Execution update, 2026-10-09: local implementation and review are complete. The
owner subsequently approved existing-database auth/ownership setup, private
configuration and a manual production deploy. See the hosted runbook for verified
results. Owner Google login and offline binding are complete; the live browser
renders 174 books. Google audience publication remains future work. Code remains
unpushed.

## Task 1: Auth and ownership contract

Write failing tests for cross-user reads, unclaimed books, runtime privileges,
verified-user owner binding, replay and refusal to reassign. Add migration 0006
for Better Auth 1.7.7, user libraries, book membership and scoped DTO functions.
Add an offline owner-binding operation. Keep migrations 0001–0005 byte-identical.
Run the real PostgreSQL suite. Expected: every new isolation assertion passes
and prior import/migration contracts remain green.

## Task 2: Nuxt server and Google sessions

Write tests for config validation, anonymous/unverified/expired sessions,
client identity spoofing, foreign details and private cache headers. Implement
Better Auth using the auth schema and restricted runtime pool. Only identity
OAuth scopes; no startup schema migration. Expose private book routes and public
health routes. Run unit and PostgreSQL HTTP integration tests. Expected: public
responses reveal no book data; only a verified session gets its own records.

## Task 3: Public landing and private library

Replace the welcome React app with Nuxt/Vue. Add provider-neutral copy, Google
sign-in, sign-out, search/status filters, empty/error states and book details.
Use published Biome CSS, responsive layouts and accessible controls. Add browser
tests exercising anonymous redirects, rendering, navigation, filters and logout.
Expected: desktop and mobile behavior pass; no server database code in bundles.

## Task 4: Verification and hosted handoff

Update Nx, lint/typecheck/build, browser scanning and Netlify routing for Nuxt.
Run `pnpm check`, `pnpm test:db`, `pnpm test:e2e`; inspect actual built output.
Use one fresh-context final review, fix important findings with regression tests.
Document exact migration, runtime grants, private configuration, owner binding,
callback and deploy sequence. Stop at the concrete hosted approval gate.

## Review focus

Check cross-user access, session revocation, provider linking and verified email,
secret/error leakage, private response caching, anonymous HTML/payload leakage,
runtime privilege escalation, migration compatibility, owner-binding races,
unassigned books, and actual Nuxt/Netlify routing. Client fixtures cannot replace
real PostgreSQL/session evidence.
