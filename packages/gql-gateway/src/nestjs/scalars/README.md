# @ebca/gql-gateway/nestjs/scalars

GraphQL scalar adapters.

- `ebca-json.scalar.ts` maps GraphQL literals and variables to EBCA JSON values.

The scalar exists inside the optional package so the core EBCA libs do not depend on `graphql` or `@nestjs/graphql`.
