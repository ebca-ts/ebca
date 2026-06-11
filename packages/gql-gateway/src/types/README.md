# GraphQL Gateway Types

- `ebca-gql-gateway.contracts.ts` defines JSON query, component mutation, snapshot, and subscription payload shapes.
- `ebca-gql-gateway.options.ts` defines module options, identity, execution context, projection policy, audience resolver, and inbound normalizer contracts.

These types stay independent from `@nestjs/graphql` so the neutral gateway can be reused by different GraphQL runtimes.
`limits.maxSubscriptionQueueSize` caps local per-subscriber buffering for slow GraphQL clients.
