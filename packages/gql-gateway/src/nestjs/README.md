# @ebca/gql-gateway/nestjs

Source for the optional NestJS GraphQL adapter.

## Files

- `ebca-gql-nestjs.module.ts` wires the local `EbcaGqlGatewayModule`, JSON scalar, resolver, and identity resolver provider.
- `resolvers/ebca-graphql-query.resolver.ts` exposes the generic `ebcaQuery` field.
- `scalars/ebca-json.scalar.ts` provides the `EbcaJson` scalar.
- `types/ebca-graphql.contracts.ts` contains GraphQL input/output classes.
- `types/ebca-graphql.options.ts` contains module options and identity resolver contracts.

The package is intentionally not imported by `app/package.json` or the Nest monorepo build until a real GraphQL boundary app opts into it.
