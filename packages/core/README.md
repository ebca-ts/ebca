# EBCA core (`@ebca/core`)

Инфраструктурный runtime-слой для Event-Based Component Architecture.
Он хранит только механики компонента/сущности, маршрутизацию и персистентный конвейер.

## Роль

- Никаких доменных правил: только инфраструктура и контрактная механика.
- Единый `ComponentManager` как write-path для всех серверных приложений.
- Единый сериализатор/маршрутизатор lifecycle через EBCA topic-подписки.
- Кэш + персистентные проекции в PostgreSQL/Cockroach + Redis.

## Ключевые модули

- `src/bases/`
  - `BaseEntity`, `BaseComponent`, `BaseCommandComponent`.
- `src/decorators/`
  - `@Entity`, `@Component`, `@System`, `@EbcaPattern`, `@PersistentProperty`, `@EbcaReadRepository`, `@EbcaQuery`, `@EbcaQueryParam`, `@EbcaType`, `@EbcaEnum`.
- `src/component.manager.ts`
  - add/update/upsert/remove/get/getComponents/persistence guards.
  - проверка разрешений `checkComponentPermissions`, lifecycle-эмиссия в NATS, opt-in ordered ingress для command-компонентов.
- `src/persistence.manager.ts`
  - JSONB-проекция и column projections по `@PersistentProperty`.
- `src/ebca.helpers.ts`
  - `EbcaEventType`, `getEntityName`, `getComponentName`, `buildEbcaTopic`.
- `src/types/`
  - контракты для компонентов/сущностей/систем, query repositories, generated transport declarations и payload-типов.
- `src/ebca.module.ts`
  - экспортирует инфраструктурный модуль.
- `src/delayed-stream.bootstrap.ts`
  - bootstrap delayed-топиков NATS.
- `src/ordered-ingress.registry.ts`, `src/ordered-ingress.service.ts`
  - JetStream-backed ordered ingress: shard выбирается при публикации команды, partition consumer replay-ит исходный EBCA topic и ack-ает после завершения handler-а.
- `src/index.ts`
  - публичный экспорт API.

## Пример использования

- Через `CoreModule.forRoot()` на уровне приложения/домена подключается стек EBCA.
- Доменные сервисы не пишут компоненты напрямую: операции идут через `ComponentManager`.
- Приложения подписываются на lifecycle через `@System`/`@EbcaPattern`.
- Внешний transport contract генерируется через `bun run ebca -- contract websocket`; enum/type declarations попадают туда только если явно зарегистрированы через `@EbcaEnum` или `@EbcaType`.

## Интеграции

- На стороне серверов: `@ebca/core`, доменные `apps/*`, `analytics-sink`, `admin`, `telegram`.
- На стороне фронта: генерация `client/src/contracts/websocket-components.generated.ts` через EBCA CLI из runtime metadata и explicit `@EbcaEnum`/`@EbcaType` declarations.
- База и брокер: TypeORM/Cockroach + Redis/Keyv + NATS.

## Структура для чтения дальше

- `src/README.md` — обзорная архитектурная картина `ebca-core`.
- `src/bases/README.md`, `src/decorators/README.md`, `src/types/README.md` — подробные справочные разделы для каждого слоя.
