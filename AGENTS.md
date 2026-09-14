# Repository guidance

This repository is the deliberately small L1 foundation for Thiago Smart Library.

## Boundaries

- Keep durable code, documentation, tests, and change descriptions in English.
- Preserve the Nx dependency direction documented in `docs/architecture.md`.
- Do not add books, reading, database, authentication, import, AI, RAG, or provider behavior without a separately approved scope.
- Keep `libs/ai` documentation-only until a real capability is approved.
- Consume the published Biome packages; do not copy their palette, token scale, or components into this repository.
- Do not connect, deploy, release, publish, or merge unless the user explicitly requests that separate operation.
- Do not install or pin `@thijulio/governance-core` until version `0.1.0` is genuinely published and validated.

## Toolchain and checks

- Use Node 24 and pnpm 10.19.0.
- Run `pnpm check` for the local quality gate and `pnpm test:e2e` for built UI and local HTTP routing.
- Use `pnpm dev` for frontend iteration and `pnpm dev:netlify` when the source health function must be available.
