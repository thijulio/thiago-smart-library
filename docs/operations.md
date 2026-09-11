# Operations

`pnpm build` emits the web bundle to `dist/apps/web` and the Netlify-compatible ESM health
function to `dist/apps/api/functions/health.mjs`. `netlify.toml` maps `/api/health` before the
SPA fallback; unknown API routes return 404.

No Netlify site has been connected or changed by this source change. An owner must grant the
existing site access to this repository, set `NODE_AUTH_TOKEN` as a build secret, choose
`main` as production, and then validate a deploy preview for this exact commit.
