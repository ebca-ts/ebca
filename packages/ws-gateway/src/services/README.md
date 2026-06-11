# WebSocket Services

- `ebca-ws-component-mutation.service.ts` validates and applies generic inbound component mutations.
- `ebca-ws-component-request.service.ts` reads exposed component snapshots by entity or collection target.
- `ebca-ws-projection.service.ts` resolves lifecycle projection audiences and envelopes.
- `ebca-ws-query.service.ts` executes `@EbcaQuery({ gates: ['ws'] })` read queries.

Services call framework APIs and project-provided adapters. They should not contain domain rules.
