# Thiago Smart Library

This repository contains the first, deliberately small foundation for Thiago Smart Library.

## Local development

Use Node 24 and pnpm 10. A GitHub Packages credential with `read:packages` is required to
install the published Biome dependencies; set it only as `NODE_AUTH_TOKEN` in your shell or
CI secret. The repository never stores it.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

`pnpm dev:netlify` exercises Netlify's local routing. Deployment is intentionally not
configured by this repository: an owner must connect the existing Netlify site and grant it
the same build-scoped package-read credential.
