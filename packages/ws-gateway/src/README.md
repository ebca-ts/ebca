# ebca-ws-gateway/src

## Основные файлы

- `ebca-ws-gateway.module.ts` — dynamic module и нормализация настроек.
- `ebca-ws.gateway.ts` — Socket.IO gateway, identity cache, configurable event listeners и outbound envelopes.
- `ebca-ws-projector.controller.ts` — `ebca.>` subscriber для live projection.
- `services/ebca-ws-component-mutation.service.ts` — generic inbound write path через `ComponentManager`.
- `services/ebca-ws-component-request.service.ts` — generic read snapshot path по exposed component metadata.
- `services/ebca-ws-query.service.ts` — named read query path по `@EbcaQuery({ gates: ['ws'] })`.
- `types/ebca-ws-gateway.options.ts` — module options, adapters, policies и resolvers.
- `types/ebca-ws-gateway.contracts.ts` — transport JSON/envelope contracts.

## Инварианты

- Внутри библиотеки нет импортов из consuming project apps, domain aliases или project database entities.
- Framework знает только EBCA metadata, Socket.IO envelope и adapter interfaces.
- Все доменные исключения выражаются через provider-ы приложения.
