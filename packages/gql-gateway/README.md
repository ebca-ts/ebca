# EBCA GQL gateway (`@ebca/gql-gateway`)

Универсальный GraphQL-facing adapter поверх EBCA query metadata.

## Роль

- Не содержит игровых импортов и доменных правил.
- Подключается через `EbcaGqlGatewayModule.forRoot(...)`.
- Исполняет `@EbcaQuery({ gates: ['gql'] })` read repository methods.
- Держит GraphQL runtime снаружи: Apollo/Nest resolver передает identity, requestId и payload в `EbcaGqlQueryService`.
- Опциональный NestJS GraphQL bridge живет во вторичном экспорте `@ebca/gql-gateway/nestjs`; `@nestjs/graphql` и `graphql` остаются optional peer dependencies.

## Подключение

```ts
EbcaGqlGatewayModule.forRoot({
  defaultRoles: ['player'],
});
```

Приложение само решает, как достать identity из GraphQL context. Библиотека получает уже аутентифицированный `identityId`, чтобы не связывать EBCA core с конкретным HTTP/GraphQL transport runtime.

Если consuming app хочет готовый generic resolver, он подключает optional subpath:

```ts
import { EbcaGqlNestjsModule } from '@ebca/gql-gateway/nestjs';
```

## Что делает

- Проверяет, что query зарегистрирована и открыта через gate `gql`.
- Собирает params class из `@EbcaQueryParam`.
- Валидирует required/default/min/max/values/array параметры.
- Вызывает read repository из Nest container.
- Возвращает JSON-ready result payload для GraphQL resolver-а.

## Сборка

- `bun run build` собирает нейтральный query gateway без `src/nestjs`.
- `bun run build:nestjs` собирает optional NestJS GraphQL bridge и требует peer/dev dependencies `@nestjs/graphql` и `graphql`.
- `bun run build:all` используется перед публикацией полного пакета.

## Границы

Game-specific правила остаются в приложении:

- auth/token/session lookup;
- GraphQL schema/resolver shape;
- field-level authorization;
- mapping ошибки transport-а в пользовательский ответ.
