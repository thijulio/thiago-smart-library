# Product Google OAuth Configuration Proposal

**Superseded for execution:** reuse the existing product Google OAuth client and
the private credentials already configured in the preceding owner handoff. Do not
create another client or follow the owner-only audience proposal below. The product
is for any verified user, Google first. The current callback, scopes, private
runtime configuration and audience verification are in
[the private library hosted handoff](../../database/runbooks/private-library-product.md).
The original proposal remains historical context; this file does not establish
that a hosted audience/callback change has been performed.

Original status: owner review; no hosted changes performed by this proposal.

## Proposed Lasting Configuration

| Setting                       | Proposed value                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| Google project                | `thiago-smart-library` (existing)                                   |
| Client type                   | Web application                                                     |
| Client name                   | `Smart Library — Production`                                        |
| Product origin                | `https://thiago-smart-library.netlify.app`                          |
| Authorized redirect URI       | `https://thiago-smart-library.netlify.app/api/auth/callback/google` |
| Authorized JavaScript origins | None required for the proposed server-side flow                     |
| Requested scopes              | `openid`, `email`, `profile` only                                   |
| Owner account                 | `thijulio@gmail.com`                                                |

Create a distinct product client; preserve the synthetic client, its callback, and its credentials. Confirm the project's current client inventory before creation to avoid duplicates. Keep the existing External/Testing audience and owner test-user configuration for now. Publishing the consent app, changing shared branding, or broadening its audience is a separate reviewed change.

## Netlify Configuration

The current repository serves a React shell and health functions, with unknown `/api/*` routes returning 404. It has no implemented Google login or confirmed product Google environment-variable contract. Creating the Google client does not make login operational.

Do not widen `SPIKE_GOOGLE_CLIENT_ID` or `SPIKE_GOOGLE_CLIENT_SECRET` to production. Product credentials must be separate, saved privately in macOS Keychain, and later added under the exact server-only names the product implementation uses. On the current Netlify plan, broader Builds/Functions/Runtime scopes require owner acceptance specifically for product credentials; the previous acceptance covered experiment branches only.

Before adding product credentials, review the implemented auth route, owner allowlist, frontend/build secret boundaries, base URL, and deployment contexts. Do not assume a lasting staging branch URL or reuse experiment preview contexts. Review staging and preview proxy routing when those environments are established.

## Database and Delivery Boundaries

The lasting architecture places Better Auth tables in an `auth` schema through versioned migrations (takeover spec §6.2). Do not create permanent product auth databases based on the experiment's proposed two-project design. M2 must review runtime roles and product/staging schema integration under the database execution contract.

No hosted SQL, real-data access, import, push, merge, deployment, resource deletion, or production variable change is authorized by this proposal. Issue #27 remains open and its live interoperability/latency checks remain pending.

## Owner Approval Requested

Approve creation of the one dedicated Web application client above, with only the exact listed redirect URI and no additional scopes or shared-project setting changes. Then save its returned credentials privately. Netlify product credential entry and product implementation remain separate steps.
