# @ebca/gql-gateway/nestjs/resolvers

Resolver classes for the optional NestJS GraphQL adapter.

- `ebca-graphql-query.resolver.ts` exposes a single generic query field and delegates execution to `EbcaGqlQueryService`.

Game-specific resolvers can wrap this service directly when they need named GraphQL fields instead of the generic `ebcaQuery` entrypoint.
