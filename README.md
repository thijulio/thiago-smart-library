# Thiago Smart Library

This repository contains the first, deliberately small foundation for Thiago Smart Library.

## Local development

Use Node 24 and pnpm 10. A GitHub Packages credential with `read:packages` is required to
install the published Biome dependencies. Export it as `NPM_TOKEN`; the repository's `.npmrc`
maps that secret to the `@thijulio` registry without storing a credential in version control.

```sh
export NPM_TOKEN=your_github_packages_token
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

`pnpm dev:netlify` exercises Netlify's local routing. The existing Netlify site deploys `main`
to production and creates deploy previews for pull requests. Its protected `NPM_TOKEN` build
secret is required for private package reads.
