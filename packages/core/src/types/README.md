# @ebca/core/src/types

Актуальная сводка по этой папке обновлена в рамках обхода `app`/`client` на 2026-05-24.

Пакет `@ebca/core/src/types` — это единый слой контрактов для EBCA: типы конструкторов, событий и параметров поведения компонентов/сущностей/систем. Здесь нет логики управления состоянием или маршрутизации как таковой; эти файлы задают, **какие формы данных допустимы и как они интерпретируются** в runtime.

В директории лежат пять файлов:

- `componens.ts` (внимание: имя файла с опечаткой в названии)
- `contracts.ts`
- `entities.ts`
- `queries.ts`
- `systems.ts`

## Ключевые файлы

- `componens.ts`
  - `ComponentConstructorArgument` — базовый тип payload-компонента (string/number/boolean/null/Date/масив/объект), который используется при восстановлении компонента из сериализованных данных.
  - `ComponentConstructor<T extends BaseComponent>` — тип конструктора компонента: должен уметь создаваться как класс, иметь `name` и `getPersistentProperties()`.
  - `ComponentPermissions` — карты ролей по событиям жизненного цикла компонента (`added`, `updated`, `removed`).
  - `ComponentWebsocketAudience`, `ComponentWebsocketProjectionOptions` — параметры outbound-проекций компонентов (аудитория, owner/city поля, типы lifecycle).
  - `ComponentInboundOperation`, `ComponentInboundEntityIdMode`, `ComponentInboundOptions` — правила входных операций и привязки entityId для команд от boundary.
  - `ComponentOptions` — конфиг компонента: `isPersistent`, `permissions`, `inbound`, `websocket`, `delayedBy`, `name`.

- `contracts.ts`
  - `EbcaContractGate` — transport/doc gates для generated declarations: `ws`, `rest`, `gql`, `grpc`, `openapi`.
  - `EbcaTypeOptions`, `EbcaEnumOptions` — plain object формы для `@EbcaType` и `@EbcaEnum`; `name` можно не указывать, если holder-класс заканчивается на `EbcaType`/`EbcaEnum`.
  - `EbcaContractDeclarationMetadata` — runtime registry shape для generated transport declarations, включая gate и source file.

- `entities.ts`
  - `EntityConstructor<T extends BaseEntity>` — тип конструктора сущности с `new` и `name`.
  - `EntityOptions` — опциональное переопределение имени сущности (используется декоратором `@Entity`).

- `queries.ts`
  - `EbcaReadRepositoryOptions`, `EbcaQueryOptions`, `EbcaQueryParamOptions` — plain object контракты для read repositories, named query methods и query param classes.
  - `EbcaQueryGate` — список transport gates, которые могут быть сгенерированы поверх query metadata (`ws`, `rest`, `gql`, `grpc`).
  - `EbcaReadRepositoryMetadata`, `EbcaQueryMetadata`, `EbcaQueryParamMetadata` — runtime registry shape для tooling/gates без transport-specific DTO.

- `systems.ts`
  - `EbcaEvent` — общий контракт событий, которые проходят через `nats`: `entityId`, `componentName`, `eventType`, `payload`, `timestamp`, `userId`.
  - `SystemConstructor<T>` — тип конструктора системы (`@Injectable()` / `@Controller()`) для системного реестра и инстанцирования.
  - `SystemOptions` — опции декоратора `@System` (например, переопределение имени).

## Связи

- `@ebca/core/src/decorators` — `@Component`, `@Entity`, `@System`, `@EbcaPattern`, `@EbcaReadRepository`, `@EbcaQuery`, `@EbcaQueryParam`, `@EbcaType`, `@EbcaEnum` используют типы из `types` и записывают их в метаданные.
- `@ebca/core/src/ebca.helpers` — `EbcaEventType`, сериализация/десериализация событий и построение topic-имен опираются на соглашения, заданные типами.
- `@ebca/core/src/bases` (`BaseComponent`, `BaseEntity`) — сюда привязаны ограничения в конструкторах (`ComponentConstructor`, `EntityConstructor`) для единообразной типизации компонентов и сущностей.
- `apps/websocket` — проверка inbound-команд и формирование websocket-проекций строго привязаны к `ComponentOptions`, `ComponentInboundOptions`, `ComponentWebsocketProjectionOptions`, `EbcaEvent`.
- `apps/telegram` — запись inbound-команд в EBCA также опирается на контрактные типы компонентов.
- Любые доменные приложения (`apps/player`, `apps/economy`, `apps/admin`, системы в `apps/*/src/systems`) используют декораторы EBCA, которые зависят от этих типов через общий модуль `ebca-core`.

## С чего начать чтение

1. Сначала `entities.ts`, чтобы понять, как типизированы EBCA-сущности на уровне конструктора и имени.
2. Затем `systems.ts`, чтобы зафиксировать контракт события (`EbcaEvent`) и системный конструктор.
3. Дальше `componens.ts`, где задаются все контрактные опции компонентов (permissions, inbound, websocket, persistence).
4. Затем `queries.ts`, где описан read-side query contract без DTO и business-specific params.
5. После этого `contracts.ts`, где описан explicit enum/type surface для generated transport contracts.
6. После этого идти в декораторы (`@Component`, `@Entity`, `@System`) и менеджеры (`ComponentManager`, `PersistenceManager`) и проверять, какие поля используются в runtime.
