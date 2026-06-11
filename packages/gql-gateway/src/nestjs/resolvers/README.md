# NestJS GraphQL Resolvers

- `ebca-graphql-query.resolver.ts` exposes `ebcaQuery`, `ebcaComponentMutation`, `ebcaComponentRequest`, and `ebcaComponent` subscription fields.

The resolver owns only GraphQL context and identity resolution. EBCA reads, writes, snapshots, and lifecycle filtering stay in the neutral gateway services.
