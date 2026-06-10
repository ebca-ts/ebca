# ebca-gql-gateway/src/types

Типы публичного API библиотеки.

- `ebca-gql-gateway.contracts.ts` описывает JSON payload/result shape.
- `ebca-gql-gateway.options.ts` описывает module options, identity и query execution context.

Типы не зависят от `@nestjs/graphql`, чтобы библиотека оставалась переносимой между code-first/schema-first GraphQL adapters.
