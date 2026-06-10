# ebca-ws-gateway services

## Слои

- `EbcaWsComponentMutationService` проверяет `ComponentOptions.inbound`, roles, scope и пишет компонент через `ComponentManager`.
- `EbcaWsComponentRequestService` читает exposed-компоненты по entity/collection target и применяет те же projection rules, что live path.
- `EbcaWsProjectionService` фильтрует lifecycle events и решает recipients через generic owner/world правила или app-provided audience resolvers.
- `EbcaWsQueryService` исполняет read repository methods, открытые через `@EbcaQuery({ gates: ['ws'] })`.

Сервисы не знают игровых enum/entity/component names. Все такие правила передаются через module options providers.
