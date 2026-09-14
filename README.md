# Thiago Smart Library

This repository contains the first, deliberately small foundation for Thiago Smart Library.

## Local development

Use Node 24 and pnpm 10. A GitHub Packages credential with `read:packages` is required to
install the published Biome dependencies. Configure that credential in your user-level npm
settings; the repository stores only the secret-free `@thijulio` registry mapping.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

`pnpm dev:netlify` exercises Netlify's local routing. Deployment is intentionally not
configured by this repository: an owner must connect the existing Netlify site, grant the
repository Actions access to the private packages, and add a build-scoped `NPM_TOKEN` to
Netlify for package reads.
