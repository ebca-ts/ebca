# @ebca/cli

`@ebca/cli` содержит developer tooling для чтения живых EBCA metadata registry.

Библиотека не содержит project-specific ownership map и не знает путей приложений. Она импортирует runtime metadata module проекта через `--runtime-module` или `EBCA_RUNTIME_MODULE`, для `links/registry/graph` исполняет decorator registration, опционально поднимает lightweight Nest testing module для зарегистрированных `@System` controllers и читает связи из `@Entity`, `@Component`, `@System`, `@EbcaPattern` и `@EbcaIO`. Генерация transport contracts использует те же runtime metadata и explicit declarations из `@EbcaType`/`@EbcaEnum`.

## Основные файлы

- `src/runtime-inspector.ts` — API для получения runtime snapshot и списка `entity + event + component -> system.handler`; system/entity domains выводятся из source files, `@EbcaIO` target entries нормализуются до `entity + component`.
- `src/runtime-graph.ts` — форматирование runtime links в Mermaid или DOT graph.
- `src/runtime-report.ts` — архитектурные отчеты поверх runtime snapshot: domains, fan-out, command workflow, command contracts, IO coverage, boundary risks, empty IO и process depth.
- `src/websocket-contract-generator.ts` — генерация websocket transport contract из runtime metadata, `@EbcaQuery`, `@EbcaType` и `@EbcaEnum`.
- `src/websocket-contract-ast.ts` — source-file reader для property/type shape; читает только source files, уже зарегистрированные декораторами.
- `src/websocket-query-contract-renderer.ts` — render query names, params и result payload контрактов.
- `src/admin-component-crud.ts` — ручной CRUD компонентов через реальный `ComponentManager`.
- `src/testing-module.ts` — lightweight Nest testing module с mock dependencies для проверки, что registered systems видны Nest как controllers.
- `src/cli.ts` — thin CLI-entry внутри библиотеки.

## Запуск

Из каталога `app`:

```bash
bun run ebca -- links
bun run ebca -- links --component CreatePlayerCommandComponent --with-io
bun run ebca -- graph --component CreatePlayerCommandComponent --with-io
bun run ebca -- graph --format dot --system OnboardingSystem
bun run ebca -- report summary
bun run ebca -- report fanout --component ExpeditionProgressComponent
bun run ebca -- report commands --domain warehouse
bun run ebca -- report command-contracts --component StartExpeditionCommandComponent
bun run ebca -- report domains
bun run ebca -- report io-coverage --domain expedition
bun run ebca -- report boundary-risks
bun run ebca -- report owners --component WarehouseCargoComponent
bun run ebca -- report risks
bun run ebca -- report tests
bun run ebca -- report empty-io
bun run ebca -- report process --component CreatePlayerCommandComponent --depth 3
bun run ebca -- contract websocket --out ../client/src/contracts/websocket-components.generated.ts
bun run ebca -- registry --json
bun run ebca -- component get --entity PlayerEntity --id <playerId> --component PlayerProfileComponent
bun run ebca -- component upsert --entity PlayerEntity --id <playerId> --component PlayerProfileComponent --payload '{"displayName":"GM"}'
```

Consuming project передает runtime metadata module через `--runtime-module` или `EBCA_RUNTIME_MODULE`. Этот project-side module должен импортировать свои domain modules, чтобы они оставались source of truth для runtime metadata. На introspection-only командах project loader может подставлять минимальные недостающие env значения только для module validation; `component` admin path остается на настоящем runtime env.

`links` по умолчанию поднимает lightweight testing module с registered systems и затем печатает связи. Если нужно только прочитать decorator metadata без Nest compile, добавь `--metadata-only`.

`contract websocket` генерирует transport contract из runtime registry:

- entity/component names берутся из `@Entity` и `@Component`, включая custom `name`;
- component payload shape читается из source files самих `@Component` classes;
- query surface берется из `@EbcaQuery({ gates: ['ws'] })` и `@EbcaQueryParam`;
- enum/type declarations попадают в контракт только если явно помечены `@EbcaEnum`/`@EbcaType`;
- CLI не принимает `componentsRoot`, `enumsRoot` или похожие project paths.

Если `--out` не указан, TypeScript-контракт печатается в stdout. `--json` печатает только stats и output path.

`--with-io` добавляет к `links` и `graph` декларации `@EbcaIO`. Class-only IO target печатается как `ComponentName` и означает trigger entity. Tuple target `[EntityClass, ComponentClass]` печатается как `EntityName.ComponentName` и используется для nested/cross-entity `ComponentManager` операций. Команда `graph` печатает Mermaid по умолчанию, а `--format dot` отдаёт Graphviz DOT.

`report` печатает compact architecture view без открытия десятков файлов:

- `summary` — общая карта runtime registry, hot systems, hot trigger components, fan-out и command writes.
- `domains` — группировка systems по source-file domains.
- `fanout` — компоненты, на которые подписано больше одного handler-а.
- `commands` — handlers, которые emit-ят command/due-компоненты, и registered handlers этих intent-ов.
- `command-flows` — явный alias `commands` для чтения цепочек output-command.
- `command-contracts` — command/due surface: owner handlers, terminal writers/removers, downstream components, inbound/websocket/delayed flags и runtime limitation по failure contracts.
- `owners` — кто слушает, читает, пишет, emit-ит и удаляет выбранный компонент.
- `risks` — структурные риски из runtime graph: metadata-based command/due intent с несколькими owner handlers, hot fan-out, command output без handler-а и пустой IO.
- `boundary-risks` — generic boundary diagnostics без project-hardcode: multi-writer domains для пары `Entity + Component` и class-only `@EbcaIO` writes/removes, которые выглядят как запись чужого state в trigger entity.
- `tests` — кандидаты для `*.i.spec` по command workflow и hot fan-out.
- `empty-io` — handlers с пустой декларацией `@EbcaIO({})`.
- `io-coverage` — trigger-only handlers, missing trigger reads и command handlers без declared output.
- `process` — рекурсивная цепочка `trigger -> handler -> emits workflow component -> next handler` с глубиной `--depth`.

`--domain` для `report` фильтрует по substring в system/entity/component/IO именах. Это не ownership model и не AST-анализ, а быстрый runtime-срез для навигации.

System/entity domains выводятся из source file registry: для `app/apps/<domain>/...` берется `<domain>`, для common entity fallback берется имя файла/класса без суффикса. Это соглашение не содержит списка доменов текущего проекта.

В `@EbcaIO` поле `emits` используется для transient output-компонентов, которые handler порождает как следующий EBCA intent/fact. Entry `ComponentClass` означает target entity = trigger entity; tuple `[EntityClass, ComponentClass]` фиксирует explicit cross-entity target. Для command workflow `commands`, `command-flows` и `process` читают `emits`; transitional command/due entries из `writes` тоже понимаются, но новый код должен предпочитать `emits`. Self-write того же command/due component, на который подписан handler, считается lifecycle/status обновлением и не печатается как следующий workflow-hop.

`report command-contracts` не выводит полный словарь `reason` и форму `failureDetails`: generic-типы команд стираются TypeScript runtime-ом. Для этого нужен отдельный explicit metadata layer у command-компонентов или декларативная gameplay-invariant документация.

Boundary checks are generic runtime-graph assertions:

- state/fact/result ownership is inferred per `Entity + Component` pair from runtime writers;
- if one `Entity + Component` pair has writers from multiple source-file domains, the report marks it as a boundary conflict;
- command/input/due components are treated as intents and are checked by command owner rules;
- command and due intents are detected through runtime `isCommand`, `inbound`, `delayedBy` and command-like naming, and should have one `COMPONENT_ADDED` owner handler;
- class-only `@EbcaIO` entries target the trigger entity;
- tuple `@EbcaIO` entries `[EntityClass, ComponentClass]` fix the target entity for cross-aggregate ComponentManager calls;
- fact fan-out is allowed, but fan-out above the configured threshold produces an integration-test candidate.

По умолчанию CLI глушит debug-логи decorator registration, чтобы вывод оставался пригодным для чтения и пайпов. Для диагностики включи `EBCA_CLI_DEBUG=1`.

Команды `component get|add|update|upsert|remove` требуют, чтобы project runtime module экспортировал `createEbcaComponentAdminTestingModule()`. CLI берет из него `ComponentManager` и работает через штатный write path, поэтому consuming project сам решает, какой Nest module поднимать и какие runtime env нужны.

## Границы

- Не использовать для генерации gameplay-контрактов.
- Не добавлять в CLI hardcoded source roots; generated declarations должны приходить через EBCA decorators.
- Не переносить сюда доменную бизнес-логику.
- Не хранить в библиотеке список доменных модулей проекта; composition root должен жить в приложении.
- Не импортировать эту библиотеку в production domain apps.
- Для тестов и DX использовать как read-only introspection surface.
- Component admin команды предназначены для ручного operator/debug использования и не должны обходить ownership доменов в обычном gameplay-коде.
