# Operations

`pnpm build` emits the web bundle to `dist/apps/web` and the Netlify-compatible ESM health
functions to `dist/apps/api/functions`. `netlify.toml` maps `/api/health` and `/api/health/db`
before the SPA fallback; unknown API routes return 404.

`pnpm dev:netlify` rebuilds the web and API outputs, serves the built web through Netlify's
local proxy, and loads the source health functions. This is also the HTTP boundary exercised
by the browser suite.

The `thiago-smart-library` Netlify site is connected to this GitHub repository with `main` as
its production branch. Netlify builds require `NPM_TOKEN` as a protected build secret so pnpm
can install the private `@thijulio` packages. Pull requests receive deploy previews, while
updates to `main` deploy to production automatically.

`/api/health/db` performs only `SELECT 1` through the server-side `DATABASE_URL` value. Set it
to the Neon pooled connection string with the Functions scope; never give it a `VITE_` prefix or
commit it to the repository. The endpoint returns only `ok` or `unavailable` and exposes no
database detail.
