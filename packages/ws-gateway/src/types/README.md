# ebca-ws-gateway types

## Файлы

- `ebca-ws-gateway.contracts.ts` — JSON payload, client envelopes, component batch и query result.
- `ebca-ws-gateway.options.ts` — `EbcaWsGatewayModuleOptions`, auth adapter, inbound normalizer, projection policy и audience resolver contracts.

## Identity

Внутреннее имя actor-а — `identityId`.
Наружное имя в websocket envelope задается `identityField`.

Это позволяет переиспользовать gateway в проектах, где actor называется `playerId`, `accountId`, `userId` или иначе.
