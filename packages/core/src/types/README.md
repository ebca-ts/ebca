# Types

Shared public contracts for EBCA runtime metadata and component behavior.

## Files

- `componens.ts` describes component constructors, permissions, inbound options, and WebSocket projection options.
- `contracts.ts` describes explicit generated-contract declarations for `@EbcaType` and `@EbcaEnum`.
- `entities.ts` describes entity constructors and entity options.
- `queries.ts` describes read repositories, named queries, query gates, and query params.
- `systems.ts` describes lifecycle event payloads and system constructors.

These types are used by core runtime code, optional gateways, and CLI tooling.
