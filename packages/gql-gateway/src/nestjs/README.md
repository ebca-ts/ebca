# @ebca/gql-gateway/nestjs

Optional NestJS GraphQL bridge.

## Files

- `ebca-gql-nestjs.module.ts` wires the neutral gateway, JSON scalar, resolver, and identity resolver provider.
- `ebca-gql-nestjs.ts` exports the subpath API.
- `ebca-gql-projector.controller.ts` listens to EBCA lifecycle events and feeds GraphQL subscriptions.
- `resolvers/` contains the generic query, mutation, snapshot, and subscription resolver.
- `scalars/` contains the `EbcaJson` scalar.
- `types/` contains bridge options and GraphQL input/output classes.
- `utils/` contains GraphQL AST JSON parsing helpers.
