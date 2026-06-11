# WebSocket Types

- `ebca-ws-gateway.contracts.ts` defines client/server envelopes, JSON payloads, component requests, and query results.
- `ebca-ws-gateway.options.ts` defines module options, auth adapters, inbound normalizers, projection policies, and audience resolvers.

The internal actor field is `identityId`. The public envelope field is configurable through `identityField`.
