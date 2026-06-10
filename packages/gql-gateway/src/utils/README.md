# ebca-gql-gateway/src/utils

Утилиты сериализации для GraphQL-facing JSON payload.

- `ebca-gql-json.ts` приводит serializable query result к JSON-ready значению через стандартную JSON-сериализацию, чтобы `Date` и plain snapshot objects выходили из gateway предсказуемо.
