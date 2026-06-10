# EBCA TypeScript

TypeScript packages for Event-Based Component Architecture.

## Packages

- `@ebca/core` - EBCA runtime, decorators, component manager, persistence, delayed streams, and ordered ingress.
- `@ebca/cli` - runtime registry reports, graph output, admin component commands, and transport contract generation.
- `@ebca/ws-gateway` - optional WebSocket gateway for component projection, mutation, requests, and read queries.
- `@ebca/gql-gateway` - optional GraphQL-facing query executor, with `@ebca/gql-gateway/nestjs` for NestJS GraphQL integration.

## Development

Install dependencies:

```bash
bun install
```

Build packages:

```bash
bun run build
```

Build every package, including the optional NestJS GraphQL subpath:

```bash
bun run build:all
```

Check package contents before publishing:

```bash
bun run pack:dry-run
```

`@ebca/core` is built first because dependent package tsconfigs resolve `@ebca/core/*` from `packages/core/dist` during local monorepo validation.

## Publishing

Packages are scoped as public npm packages under `@ebca/*`. Run package builds before publishing so `dist` is present, then publish each package with `npm publish --access public` from its package directory or through a release workflow.

The repository currently keeps `license: UNLICENSED` until the owner chooses an explicit public license.
