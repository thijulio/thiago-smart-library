# Operations

`pnpm build` emits the web bundle to `dist/apps/web` and the Netlify-compatible ESM health
function to `dist/apps/api/functions/health.mjs`. `netlify.toml` maps `/api/health` before the
SPA fallback; unknown API routes return 404.

`pnpm dev:netlify` rebuilds the web and API outputs, serves the built web through Netlify's
local proxy, and loads the source health function. This is also the HTTP boundary exercised
by the browser suite.

The `thiago-smart-library` Netlify site is connected to this GitHub repository with `main` as
its production branch. Netlify builds require `NPM_TOKEN` as a protected build secret so pnpm
can install the private `@thijulio` packages. Pull requests receive deploy previews, while
updates to `main` deploy to production automatically.
