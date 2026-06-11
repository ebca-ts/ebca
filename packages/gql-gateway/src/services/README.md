# GraphQL Gateway Services

- `ebca-gql-query.service.ts` validates and executes `@EbcaQuery({ gates: ['gql'] })` read queries.

The service receives an authenticated EBCA identity from the adapter layer. It does not read HTTP context and does not build a GraphQL schema.
