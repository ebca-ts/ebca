# Декораторы EBCA

Актуальная сводка по этой папке обновлена в рамках обхода `app`/`client` на 2026-05-24.

Папка `@ebca/core/src/decorators` содержит только декораторный слой EBCA. Он отвечает за регистрацию метаданных сущностей, компонентов и систем в рантайме, а также за сбор сведений, которые нужно использовать менеджерам при автодискавери и обработке событий.

Механизм здесь не про бизнес-логику предметной области. Он делает две вещи:  
1) добавляет типам стабильные метаданные;  
2) кладёт эти типы в локальные реестры для последующего поиска.

## Ключевые файлы

- `entity.decorator.ts` — декоратор `@Entity`, глобальный реестр `REGISTERED_ENTITIES`, `getRegisteredEntities`, `getEntityConstructorByName`, `getEntityOptions`.
- `component.decorator.ts` — декоратор `@Component`, глобальный реестр `REGISTERED_COMPONENTS`, `getRegisteredComponents`, `getComponentOptions`, `resolveDelayedComponentAt`, `checkComponentPermissions`, `getComponentConstructorByName`.
- `system.decorator.ts` — декоратор `@System`, проброс Nest `@Controller`, глобальный реестр `REGISTERED_SYSTEMS`, `getRegisteredSystems`, `getSystemOptions`, `getSystemName`.
- `decorator-source-file.ts` — общий helper для сохранения source file классов, зарегистрированных декораторами.
- `ebca-contract.decorator.ts` — декораторы `@EbcaType` и `@EbcaEnum`, явный registry type/enum declaration names для generated transport contracts.
- `ebca-io.decorator.ts` — декоратор `@EbcaIO`, декларативный may-use контракт компонентов, которые handler может читать, писать, эмитить или удалять; entries поддерживают `ComponentClass` и tuple `[EntityClass, ComponentClass]` для explicit target entity.
- `ebca-pattern.decorator.ts` — декоратор `@EbcaPattern`, генерация топика через `buildEbcaTopic`, регистрация подписки в `EBCA_PATTERN_SUBSCRIPTIONS`, optional регистрация ordered ingress rule, возвращение `getEbcaPatternSubscriptions`.
- `ebca-query.decorator.ts` — декораторы `@EbcaReadRepository`, `@EbcaQuery`, `@EbcaQueryParam`, реестры read repositories/query methods/query params для gate generation и read-side tooling.
- `persistent-property.decorator.ts` — декоратор `@PersistentProperty`, описание связи `поле компонента -> поле сущности`, класс `PersistentPropertyMetadata`, запись в `PERSISTENT_PROPERTIES_METADATA`.
- `metadata.storage.ts` — обёртка `MetadataStorage` поверх `Reflect` для типизированного чтения/записи (`defineMetadata`, `getMetadata`, `getMetadataOrNull`).

## Связи

- `../types` (`EntityConstructor`, `ComponentConstructor`, `SystemConstructor`, `SystemOptions`): типы для сигнатур декораторов и API доступа к метаданным.
- `../bases` (`BaseEntity`, `BaseComponent`): базовые абстракции, с которыми связаны все декораторы сущностей и компонентов.
- `../ebca.helpers`: единый построитель EBCA-топиков (`buildEbcaTopic`) и типы событий (`EbcaEventType`) для подписок.
- `@nestjs/common`: `Logger` для регистрации диагностических событий и `ForbiddenException` для проверки ролей компонентов.
- `@nestjs/microservices`: `EventPattern` из `@EbcaPattern`, чтобы методы систем стали обработчиками микросервисных событий.
- `reflect-metadata`: инфраструктура хранения всех метаданных.
- Менеджеры EBCA и код системы: через `getRegistered...`/`get...ConstructorByName` и `getEbcaPatternSubscriptions` потребляют зарегистрированные типы и связывают их с runtime-конвейером.

## Что делает каждый декоратор

- `@Entity`: помечает класс-сущность и заносит её в реестр; умеет возвращать все зарегистрированные сущности, source file и искать конкретную по имени.
- `@Component`: помечает класс-компонент, управляет дефолтными опциями (`isPersistent = false`), позволяет получить опции, разрешить `delayedBy` и проверить права операций.
- `@System`: помечает класс-систему, применяет Nest controller metadata, хранит и читает имя/опции/source file системы, формирует список доступных системных классов.
- `@EbcaIO`: описывает декларативный IO обработчика через `reads`, `writes`, `emits` и `removes`; не исполняет код и не трогает `ComponentManager`; запись без tuple относится к trigger entity, tuple `[EntityClass, ComponentClass]` фиксирует cross-entity target.
- `@EbcaPattern`: помечает метод системы как обработчик EBCA-событий, нормализует payload в случае `componentClass`, регистрирует подписку для централизованного учёта; при `orderedIngress` требует concrete `entityClass`, concrete `componentClass` и `COMPONENT_ADDED`.
- `@EbcaReadRepository`: помечает Nest injectable class как EBCA read-side repository и кладёт его в registry без доменной write-логики.
- `@EbcaQuery`: помечает method read repository как named query endpoint; metadata описывает gates, target entity и components для EBCA projection, а contract params берутся из первого аргумента-класса с `@EbcaQueryParam`.
- `@EbcaQueryParam`: помечает property query contract class как runtime-validatable param; primitive type берётся из `design:type`, ограничения задаются plain object options.
- `@EbcaType`: помечает metadata-holder class и кладёт в registry один type declaration; без `name` имя выводится из holder-класса вроде `ResourceBalanceEbcaType`.
- `@EbcaEnum`: помечает metadata-holder class и кладёт в registry один enum declaration; без `name` имя выводится из holder-класса вроде `CityKeyEbcaEnum`.
- `@PersistentProperty`: фиксирует явный маппинг поля компонента на колонку сущности для дальнейшей персистенции.
- `MetadataStorage`: общий безопасный доступ к `Reflect`-метаданным с типами и значениями по умолчанию.

## С чего начать чтение

1. `metadata.storage.ts` — быстро понять, как устроен общий доступ к метаданным.
2. `entity.decorator.ts`, `component.decorator.ts`, `system.decorator.ts` — посмотреть единый паттерн: декоратор + реестр + функции чтения.
3. `ebca-pattern.decorator.ts` и `ebca-io.decorator.ts` — понять связь событийной инфраструктуры с декларативной картой handler IO.
4. `ebca-query.decorator.ts` — посмотреть read-side metadata для query repositories и automatic gates.
5. `ebca-contract.decorator.ts` — посмотреть explicit type/enum surface для contract generation.
6. `persistent-property.decorator.ts` — перейти к персистентным полям и маппингу в сущности.
