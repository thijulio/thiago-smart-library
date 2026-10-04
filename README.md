# Thiago Smart Library

Thiago Smart Library is a private, single-owner reading library that replaces the Thiago Library
prototype. Daily capture works from ChatGPT and Claude through an MCP server.

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

## Documentation

- [Product overview](docs/product/overview.md) and [decisions](docs/product/decisions.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap/README.md); live status is in GitHub milestones
- [Database contract](docs/database/README.md)
- [Takeover design](docs/superpowers/specs/2026-10-04-smart-library-takeover-design.md) and
  [M0 plan](docs/superpowers/plans/2026-10-04-m0-takeover.md)
