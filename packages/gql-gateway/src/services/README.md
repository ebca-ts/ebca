# ebca-gql-gateway/src/services

Сервисы transport-neutral GraphQL-facing слоя.

- `ebca-gql-query.service.ts` исполняет declarative EBCA read queries, открытые для gate `gql`.

Сервис не строит GraphQL schema и не читает HTTP context. Эти части принадлежат приложению или будущему thin adapter-у поверх конкретного GraphQL runtime.
