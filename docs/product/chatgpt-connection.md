# ChatGPT connection — product direction

Captured 2026-10-02. **Product direction confirmed; integration design and implementation not approved or delivered.** This document owns the intended connection experience. It does not change the approved database delivery contract.

## Intended experience

A user signs into Smart Library, chooses **Connect with ChatGPT**, authorizes their ChatGPT connection, and uses eligible AI features inside the site through their own ChatGPT account. Smart Library owns the library records, product workflows and reviewable AI results. The user controls the AI connection.

ChatGPT is the only planned AI connection for now. There is no API-key input, BYOK fallback, additional provider, or automatic switch to a platform-funded credential in this scope. The app's existing single-owner database delivery is unchanged; describing this future user journey does not introduce multi-user tenancy.

## Terminology and verified feasibility

**BYOK** means Bring Your Own Key: the user supplies an API key. That is different from the chosen account-authorization experience. Use **user-connected ChatGPT** in project documentation. “Connect with ChatGPT” expresses the product intent; final button wording and branding must follow OpenAI's applicable guidance.

OpenAI documents Sign in with ChatGPT for identity and separately authorized ChatGPT plan usage. Identity alone does not enable inference, and neither permission grants access to existing ChatGPT conversations. [Official quickstart](https://developers.openai.com/siwc/quickstart).

The documented open-source/local flow does not establish eligibility for this hosted site: paid or remotely hosted integrations are directed to an interest form. Smart Library's hosted access remains unverified. Keep the feature planned until the actual app is accepted for the relevant flow. [Plan-usage scope](https://developers.openai.com/siwc/token-sharing-open-source).

Website sign-in currently requires selected-partner access and a registered OAuth client. The documented approach uses Authorization Code with PKCE and OpenID Connect, followed by an application-owned session. [Website integration](https://developers.openai.com/siwc/website).

These are dated feasibility observations, not promises of entitlement or release readiness. Recheck official documentation before designing or enabling the integration. Do not make the repository public, change hosting, or register a provider client to bypass an eligibility gate.

## Proposed journey and states

1. The user obtains a Smart Library session. Authentication design is still a separate discovery task.
2. The user chooses the ChatGPT connection action and sees what account permission and library context the feature needs.
3. OpenAI handles authentication and consent. The app never asks for the ChatGPT password or copied browser/session tokens.
4. The app distinguishes identity verified, plan usage authorized, and inference available. It shows connected AI only after the required permission and eligibility checks succeed.
5. The user requests an approved AI action using relevant library context. The result identifies its source records and remains distinguishable from user-authored content.
6. The user can disconnect AI and reconnect later. Disconnecting preserves library records and previously retained results while preventing new AI requests through that connection.

Design explicit states for disconnected, connecting, identity-only, ready, temporarily unavailable, usage-limited, expired/revoked and reconnect-required. Cancelled consent leaves records unchanged. Do not silently enable billable alternatives or imply unlimited usage.

Connecting an account does not automatically import its ChatGPT history, memory, custom instructions or all personal context. Personalization inside Smart Library must come from explicitly available library records and approved user inputs.

## Boundaries for the later design

- Keep app identity, library permissions and AI authorization separate, even if a future approved sign-in flow combines their presentation.
- Associate credentials and AI jobs with the authorized app identity; prevent cross-account use and define account switching before supporting it.
- Define protected credential storage, refresh/revocation, application sessions and disconnect behavior before implementing the connection. Do not place tokens in browser persistence, repository files, logs, analytics or public bundles.
- Show which library data an AI action sends. Send only the context needed for that approved action, and preserve source attribution for retained output.
- Recording books, wishlist changes and feedback must succeed without ChatGPT. AI failures cannot roll back those records.
- Authorize asynchronous work explicitly; document whether accepted work continues after the user leaves and how disconnect cancels or stops pending requests.
- Treat available models and usage limits as account-dependent. Do not hard-code a subscription's entitlement or assume every OpenAI API tool is supported by this connection.

The documented inference route uses account-specific models and the public Responses API. Preview restrictions include streaming requests with `store: false` and several unsupported hosted tools; evaluate each proposed feature against that route before committing to it. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Roadmap ownership and acceptance

[DISC-01](https://github.com/thijulio/thiago-smart-library/issues/13) owns hosted eligibility, app authentication, connection consent, sessions and disconnect design. [DISC-02](https://github.com/thijulio/thiago-smart-library/issues/14) owns the first grounded AI action, user context disclosure, result provenance, asynchronous lifecycle and failure behavior. [Roadmap](../roadmap/README.md).

Before implementation, record evidence that the named hosted app can use the required official integration; approve its authentication/credential design and one initial AI workflow. Then define acceptance tests for cancelled consent, identity without inference permission, expired/revoked access, usage limits, account isolation, reconnect, disconnect and AI-independent record capture.

If hosted eligibility is unavailable, report that exact blocker and keep the library usable without AI. An API-key fallback requires a new user decision. No provider registration, connection, model request, application behavior, database migration, deployment or cutover is performed by this documentation update.
