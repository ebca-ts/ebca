# GraphQL Gateway Services

- `ebca-gql-component-mutation.service.ts` writes exposed inbound components through `ComponentManager`.
- `ebca-gql-component-request.service.ts` resolves projected component snapshots.
- `ebca-gql-projection.service.ts` converts EBCA lifecycle messages into audience-filtered GraphQL component events.
- `ebca-gql-query.service.ts` validates and executes `@EbcaQuery({ gates: ['gql'] })` read queries.
- `ebca-gql-subscription-registry.service.ts` tracks local GraphQL subscribers for this gateway instance.

The service receives an authenticated EBCA identity from the adapter layer. It does not read HTTP context and does not build a GraphQL schema.
Subscription queues are bounded by `limits.maxSubscriptionQueueSize`; stale events are dropped for slow consumers.
