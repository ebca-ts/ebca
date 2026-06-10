# ebca-gql-gateway/src

## Основные файлы

- `ebca-gql-gateway.module.ts` — dynamic module и нормализация настроек.
- `services/ebca-gql-query.service.ts` — named read query path по `@EbcaQuery({ gates: ['gql'] })`.
- `types/ebca-gql-gateway.contracts.ts` — JSON payload contracts для GraphQL-facing resolver-а.
- `types/ebca-gql-gateway.options.ts` — module options и identity/query context contracts.
- `utils/ebca-gql-json.ts` — JSON serialization helpers.

## Инварианты

- Внутри библиотеки нет импортов из consuming project apps, domain aliases или project database entities.
- Framework знает только EBCA query metadata, Nest container и JSON payload contracts.
- Настоящий GraphQL transport adapter может быть тонким resolver-слоем поверх `EbcaGqlQueryService`.
