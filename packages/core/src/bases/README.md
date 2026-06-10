# @ebca/core/src/bases

Актуальная сводка по этой папке обновлена в рамках обхода `app`/`client` на 2026-05-24.

Папка `bases` содержит только базовые EBCA-абстракции, от которых отталкиваются все компоненты и сущности этого слоя.

Здесь лежат не сценарии игры и не бизнес-правила, а минимальный контракт для состояния: общий формат времени, статусной логики команд и JSONB-хранения компонентов в сущностях.

## Ключевые файлы

`base.component.ts`
- Базовый класс для всех EBCA-компонентов.
- Задаёт `createdAt`/`updatedAt`.
- Держит статический метод `getPersistentProperties`, который читает метаданные из `@PersistentProperty` через `reflect-metadata` и возвращает список персистентных полей для проекции в отдельные колонки.

`base-command.component.ts`
- Базовый класс для command-компонентов.
- Определяет жизненный цикл статуса команды: `pending` → `succeeded` / `rejected`.
- Содержит поля `commandId`, `callbackQueryId`, `status`, `reason`, `failureDetails` и методы управления состоянием `reject`, `succeed`, `resetCommandState`.
- `commandId` используется как стабильный id публикации/replay для инфраструктурных путей, которым нужна идемпотентность или журнальная доставка.

`base.entity.ts`
- Базовый класс для EBCA-сущностей.
- Устанавливает `id: uuid` как первичный ключ.
- Добавляет колонку `components` (`jsonb`) для хранения персистентных компонентов, которые не выведены в отдельные projections.

## Связи

- `decorators/persistent-property.decorator.ts` — определяет свойства, которые `BaseComponent.getPersistentProperties()` отдаёт для сохранения в entity-колонках.
- `decorators/entity.decorator.ts`, `decorators/component.decorator.ts`, `decorators/ebca-pattern.decorator.ts` — используют базовые контракты компонентов/сущностей как часть инфраструктурной регистрации EBCA-типов.
- `component.manager.ts`, `persistence.manager.ts`, `entities/*` — опираются на `BaseComponent` и `BaseEntity` при сборке, обновлении и сохранении snapshot-состояния.
- `ebca.helpers.ts` — использует имена/структуры базовых типов при маршрутизации и сборке EBCA-событий.

## С чего начать чтение

1. `base.component.ts` — базовый контракт компонента и механизм `PersistentProperty`.
2. `base-command.component.ts` — статусы и шаблон управления жизненным циклом command-компонентов.
3. `base.entity.ts` — способ хранения и идентификации сущностей с `components` в формате JSONB.
4. `decorators/persistent-property.decorator.ts` и `persistence.manager.ts` — как именно описанные базовые абстракции попадают в фактическое сохранение.
