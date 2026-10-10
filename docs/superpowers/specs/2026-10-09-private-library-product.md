# Private library product

Owner direction on 2026-10-09 supersedes the single-owner-only auth assumptions
and the separate spike prerequisite in the takeover design.

The public home page describes Smart Library. It never loads book records.
Google is the first sign-in provider, but books belong to an application user ID,
not a Google ID or email. Any verified user can sign in; today only the owner has an imported library.
Additional providers can be enabled later without changing book ownership.
A new account sees an empty library and never claims existing books.

The authenticated library lists the signed-in user's books, with search, status
filtering and a private detail page. All reads derive identity from a validated
server session. Query parameters and client-provided IDs cannot change ownership.
Anonymous requests fail with 401; unverified accounts fail with 403; a missing or
foreign book returns 404. Private responses are not cached or included in public
SSR output. Session revocation takes effect on the next request.

Reuse the existing imported Neon database and product Netlify site. Add auth
tables and ownership mapping without replacing imported records or changing old
migration bytes. Give the application a restricted credential for auth storage
and explicitly scoped reading functions. It cannot read base library tables,
audit data or invoke importer/editor operations. Owner binding is a separate
offline, transactional and idempotent command after the owner's first verified
login; it never runs during signup, startup or build.

No spike resources, automatic reimport or Sheet cutover. Hosted migrations,
credential provisioning, owner binding and deployment need explicit approval
at the time of each action. The owner subsequently approved hosted setup and
manual publication on 2026-10-09; code remains unpushed. The hosted runbook records
the verified result, completed owner login/binding and remaining Google audience step.
Credentials and real records remain private. Test with synthetic disposable
PostgreSQL, not the imported database.

Consume published Biome CSS; use semantic HTML and product layout CSS without
copying shared token, palette or component source. The Vue package could not be
resolved from the current registry, so its future adoption is independent of
this functional slice.
