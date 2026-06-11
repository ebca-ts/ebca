# GraphQL Gateway Types

- `ebca-gql-gateway.contracts.ts` defines JSON query payload and result shapes.
- `ebca-gql-gateway.options.ts` defines module options, identity, and execution context contracts.

These types stay independent from `@nestjs/graphql` so the neutral gateway can be reused by different GraphQL runtimes.
