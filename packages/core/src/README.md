# @ebca/core/src

Этот пакет — серверный инфраструктурный слой EBCA (Event-Based Component Architecture) для всех доменных приложений репозитория.
Он держит минимально необходимые runtime-контракты:
- типизированные компоненты и сущности,
- регистрационные декораторы,
- менеджеры записи/чтения/перехода состояний,
- сборку и раздачу событий в NATS,
- связку с персистентным слоем (Redis + Cockroach).

`ebca-core` — это не бизнес-логика домена, а контрактная и инфраструктурная рамка, которая задаёт как именно компонентные состояния пишутся, хранятся и стримятся между приложениями.

## Роль и границы слоя

- Реализация протокола управления игровым состоянием в терминах EBCA-компонентов.
- Единый канал для runtime-событий: команды/факты/снапшоты идут через `ComponentManager` → `NATS` → `@EbcaPattern`-обработчики.
- Базовый источник правды для команды:
  - Redis хранит текущие non-command компоненты,
  - Cockroach/TypeORM хранит проекции (`@PersistentProperty`), а также JSONB-хранилище персистентных компонентов.
- Компонентные команды (`*CommandComponent`) рассматриваются как **интент в lifecycle**, не как долговременный state в Redis.
- Горизонтально масштабируется за счёт разделения статeless-сервиса и событийной шины.

Ключевая гарантия архитектуры: доменные приложения не должны писать агрегаты напрямую, а должны идти через EBCA write-path (`ComponentManager`) и событийные обработчики.

## Публичный API (`src/index.ts`)

- `EbcaModule`
- `ComponentManager`
- `PersistenceManager`
- `DelayedStreamBootstrap`
- `EbcaOrderedIngressService`, registry/options для opt-in ordered ingress
- Базовые классы: `BaseEntity`, `BaseComponent`, `BaseCommandComponent`
- Декораторы: `@Component`, `@Entity`, `@PersistentProperty`, `@System`, `@EbcaPattern`, `@EbcaIO`, `@EbcaReadRepository`, `@EbcaQuery`, `@EbcaQueryParam`, `@EbcaType`, `@EbcaEnum`
- Утилиты из `ebca.helpers` (`EbcaEventType`, `buildEbcaTopic`, сериализация)
- Типы для декораторов/менеджеров: `ComponentConstructor`, `ComponentConstructorArgument`, `EntityConstructor`, `SystemConstructor`, `SystemOptions`

## Подмодули `src`

- `bases/`
  - `base.entity.ts`: `BaseEntity` с `id` и JSONB `components`.
  - `base.component.ts`: `BaseComponent` + `getPersistentProperties()`.
  - `base-command.component.ts`: `BaseCommandComponent` и жизненный цикл статуса команды.
- `types/`
  - Типы `BaseEntity`, `BaseComponent`, конструкторов и опций компонентов/систем.
  - Контракты для команд, inbound/websocket опций, event-type и payload.
  - Контракты read repositories, named query methods, gates и query params.
  - Контракты generated transport declarations, которые registry открывает генераторам.
- `decorators/`
  - `component.decorator.ts`, `entity.decorator.ts`, `system.decorator.ts`, `ebca-pattern.decorator.ts`.
  - Глобальные реестры и lookup-функции для `@Component`, `@Entity`, `@System`, `@EbcaPattern`, `@EbcaIO`, `@EbcaReadRepository`, `@EbcaQuery`, `@EbcaType`, `@EbcaEnum`.
  - `persistent-property.decorator.ts`: mapping поля компонента в колонку SQL-сущности.
- `component.manager.ts`
  - Основная write/read API для компонентов.
  - Проверяет разрешения, пишет Redis/персистентные проекции, эмитит lifecycle в `NATS`.
  - Перед обычным emit может поставить command-component в ordered ingress, если matching `@EbcaPattern` зарегистрировал `orderedIngress`.
  - При `updateComponent` SQL-проекции из `@PersistentProperty` обновляются только если изменились сами mapped-поля; live-only поля компонента не вызывают лишний SQL update.
- `persistence.manager.ts`
  - Работа с TypeORM-сущностями: JSONB-проекция (`components`) и columns-сnapshots по `@PersistentProperty`.
  - Поддержка транзакций и conditional update/guard.
- `ebca.helpers.ts`
  - `EbcaEventType`, `getEntityName`, `getComponentName`, `buildEbcaTopic`, `serialize/deserialize`.
- `ebca.module.ts`
  - Глобальный модуль `EbcaModule`, экспортирует `ComponentManager`.
- `delayed-stream.bootstrap.ts`
  - Инициализация JetStream-стрима для `delayed`-команд (NATS schedule/отложенные lifecycle).
- `ordered-ingress.registry.ts`
  - Контракты `EbcaOrderedIngressOptions`, key resolver, publish context и JetStream envelope.
- `ordered-ingress.service.ts`
  - Opt-in JetStream вход для команд: вычисляет shard на публикации, пишет envelope в partition subject, replay-ит оригинальный EBCA topic через NATS request/reply и ack-ает сообщение только после завершения handler-а.

### Что **не** является частью `ebca-core`

- Сюда не попадает доменный код (`карта`, `экономика`, `боевой контур` и т.д.).
- Не формируется бизнес-ответ "по сценарию", а только единый механизм и контракты инфраструктуры.

## Архитектурные контракты

- Базовые модели:
  - `BaseEntity` + `BaseComponent` + `BaseCommandComponent`.
  - `ComponentConstructor`, `EntityConstructor`, `SystemConstructor`.
- Декораторные контракты:
  - `@Component(options)`:
    - `isPersistent`: попадание в JSONB/проекции;
    - `permissions`: RBAC по операциям `added/updated/removed`;
    - `inbound` (`expose`, `operations`, `entityId`, `roles`, ownership);
    - `websocket` (`expose`, аудитория, owner/city поля, lifecycle filter);
    - `delayedBy` для отложенных команд.
  - `@Entity(options)` — регистрация и переименование типа сущности.
  - `@System(options)` — регистрация системы и проброс Nest controller metadata.
  - `@EbcaPattern(...)` — декларативный подписчик на `ebca.{entity}.{id}.{event}.{component}`; optional `orderedIngress` доступен только для concrete `entityClass` + `componentClass` и `COMPONENT_ADDED`.
  - `@EbcaIO(...)` — декларативный may-use контракт handler-а для `reads`, `writes`, `emits`, `removes`; entries могут быть `ComponentClass` или `[EntityClass, ComponentClass]` для explicit target entity; используется DX-инструментами и e2e-проверками, не меняя prod runtime path.
  - `@EbcaReadRepository(...)`, `@EbcaQuery(...)`, `@EbcaQueryParam(...)` — декларативный read-side contract: repository class, named query method, query param class, gates и EBCA projection shape (`entityClass` + `components`).
  - `@EbcaType(...)`, `@EbcaEnum(...)` — явная регистрация type/enum declaration name для generated transport contracts; `interface`/`type` и `enum` сами по себе не дают class decorator target, поэтому они маркируются через metadata-holder class.
  - `@PersistentProperty(...)` — mapping `componentProperty -> entityProperty` для SQL-проекций.
- Событийный протокол:
  - `EbcaEventType`: `added` | `updated` | `removed`.
  - Топик: `ebca.{entityName|*}.{entityId|*}.{eventType}.{componentName|*}`.
- Командный lifecycle:
  - Командные компоненты транзитные; на `remove`/`terminal success` эмитится lifecycle `updated` с `succeed()`, а не `removed`.
  - `commandId` может задаваться издателем заранее; ordered ingress использует его как JetStream duplicate id и replay packet id.
  - Ordered ingress не глобален: без `orderedIngress` в `@EbcaPattern` команда идёт прежним NATS emit path.
  - Для отклонения используется `reject(reason, failureDetails)`.
- Набор операций менеджера:
  - `addComponent`, `updateComponent`, `upsertComponent`, `removeComponent`,
    `getComponent(s)`, `getCachedComponents`, `hasComponent(s)`, guard/transaction helpers.
- Порядок авторизации:
  - проверка `permissions` до изменения;
  - затем операции персистенции/кеширования;
  - затем эмиссия NATS-события только после факта изменения.

## Зависимости

- Внутренние:
  - Пакет используется как `@ebca/core`.
  - Ставится через `EbcaModule` в composition root consuming app.
  - Реализация доменных компонентов и entities живет в consuming project.
- Внешние:
  - NestJS (`@nestjs/*`) для DI/guards/decorators/microservices.
  - Redis через `@nestjs/cache-manager` + `@keyv/redis`.
  - NATS (`@nestjs/microservices` / `nats`) как шина lifecycle-событий.
  - TypeORM/PostgreSQL через Cockroach для репликации/проекций.
  - `reflect-metadata` для runtime метаданных.

## Как используется приложениями backend

- Consuming project подключает `EbcaModule` в своем composition root, поэтому доменные приложения наследуют EBCA-инфраструктуру через общий модуль.
- Доменные `apps/*` (напр. `economy`, `caravan`, `player`, `combat`, `guild`, `world` и др.):
  - описывают компоненты и сущности через `@ebca/core` декораторы и `Base*`;
  - пишут изменения только через `ComponentManager`;
  - подписывают доменные процессы через методы с `@EbcaPattern` и/или `@System`;
  - используют `@PersistentProperty` для легких SQL-проекций вместо прямого SQL-записи компонентов.
- `app/apps/websocket`:
  - inbound: `websocket-component-mutation.service.ts` валидирует `@Component(...inbound...)`, роли и `entityId` scope и вызывает `ComponentManager`.
  - outbound: `websocket-component-query.service.ts` читает только `websocket.expose` и выдаёт снапшоты по EBCA контрактах.
- `analytics-sink/admin/bot-director/telegram` и др. потребляют те же контракты и lifecycle через `ComponentManager`/`@EbcaPattern`, без дублирования схем состояния.

## Как используется клиентом

- Клиент не импортирует `ebca-core` напрямую.
- Контракты для UI генерируются через `bun run ebca -- contract websocket --out ../client/src/contracts/websocket-components.generated.ts`.
- Генератор читает runtime metadata `@Entity`, `@Component`, `@EbcaQuery` и explicit declarations из `@EbcaType`/`@EbcaEnum`; он не сканирует project-specific папки с enum/types.
- UI читает EBCA-снапшоты через:
  - `GameSocketProvider` (хранение `GameComponentStore`),
  - `useEbcaComponent`, `useEbcaEntity`, `useEbcaEntities` (`client/src/hooks/useEbcaEntity.ts`),
  - `useGameEbca` API из контекста для `add/update/upsert/remove`.
- Команды из клиента уходят как websocket-мутаторы в `client.component` и проходят обратно через серверный inbound-путь `ebca-core`/`apps/websocket`.

## Что важно помнить

- `ebca-core` держит shape и механику, а доменная математика и правила валидации — в `common` + доменных приложениях.
- Нельзя считать `ComponentManager` «просто удобным кэшем»: это контрактный write-path.
- Любые новые доменные фичи добавляют контракты в domain/common-слой, а протоколы и порядок доставки компонентов остаются инфраструктурными для `ebca-core`.

## Быстрые точки входа

1. `index.ts` — публичный API текущего пакета.
2. `types/` — контракты и сигнатуры для типобезопасности.
3. `decorators/` — регистрация и discovery.
4. `bases/` — базовые классы `Base*`.
5. `component.manager.ts` + `persistence.manager.ts` — runtime-сердце слоя.
6. `@ebca/cli` — read-only DX-инструменты поверх runtime registry.
