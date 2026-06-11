# @ebca/gql-gateway/nestjs

Optional NestJS GraphQL bridge.

## Files

- `ebca-gql-nestjs.module.ts` wires the neutral gateway, JSON scalar, resolver, and identity resolver provider.
- `ebca-gql-nestjs.ts` exports the subpath API.
- `resolvers/` contains the generic `ebcaQuery` resolver.
- `scalars/` contains the `EbcaJson` scalar.
- `types/` contains bridge options and GraphQL input/output classes.
- `utils/` contains GraphQL AST JSON parsing helpers.
