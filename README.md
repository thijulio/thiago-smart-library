# Thiago Smart Library

This repository contains the first, deliberately small foundation for Thiago Smart Library.

## Product direction and roadmap

The intended AI experience is **Connect with ChatGPT**: a user authorizes their
own ChatGPT account for eligible AI features inside Smart Library. ChatGPT is
the only planned connection; API-key BYOK is outside the current direction.
Hosted integration eligibility and implementation remain pending.

- [Product documentation](docs/product/README.md)
- [Roadmap and delivery tickets](docs/roadmap/README.md)
- [Documentation index](docs/README.md)
- [Current architecture](docs/architecture.md)
- [Operations](docs/operations.md)

Product records must remain usable without AI. This future direction does not
expand the current foundation/database implementation scope.

## Local development

Use Node 24 and pnpm 10.19.0. A GitHub Packages credential with `read:packages` is required to
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
