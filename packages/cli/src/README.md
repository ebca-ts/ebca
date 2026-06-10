# @ebca/cli/src

Runtime-introspection API и thin CLI для EBCA DX.

## Файлы

- `runtime-inspector.ts` собирает snapshot зарегистрированных entities/components/systems, связи `entity + event + component -> system.handler`, source-file domains и target-aware `@EbcaIO`.
- `runtime-graph.ts` форматирует runtime links в Mermaid или Graphviz DOT.
- `runtime-report.ts` строит архитектурные отчеты `summary`, `domains`, `fanout`, `commands`, `command-flows`, `command-contracts`, `owners`, `risks`, `boundary-risks`, `boundary-diagnostics`, `multi-writers`, `tests`, `empty-io`, `io-coverage`, `process` и `cycles` поверх runtime snapshot.
- `websocket-contract-generator.ts` генерирует websocket transport contract из runtime snapshot, `@EbcaQuery`, `@EbcaType` и `@EbcaEnum`.
- `websocket-contract-ast.ts` восстанавливает property shape компонентов, читает их импортированные source-файлы и разрешает только те enum/type declarations, которые есть в EBCA contract registry.
- `websocket-contract-source-files.ts` собирает source-файлы компонентов и их локальный import graph для восстановления exported type/enum declarations без project-specific roots.
- `websocket-query-contract-renderer.ts` рендерит query names, params-by-name и query result payload contracts.
- `admin-component-crud.ts` выполняет ручные `get/add/update/upsert/remove` над компонентами через настоящий `ComponentManager`.
- `testing-module.ts` поднимает lightweight Nest testing module из registered systems как controllers, используя mock dependencies.
- `cli.ts` разбирает команды `links`, `registry`, `graph`, `report`, `contract websocket` и `component`, вызывает runtime inspector/admin CRUD/reporting/generation и печатает text/json/graph.

## Правила

- Источник связей только runtime registry, не AST и не generated frontend contract.
- Источник generated type/enum declarations только `@EbcaType`/`@EbcaEnum`; CLI не сканирует project-specific папки, не принимает hardcoded roots и использует import graph уже зарегистрированных компонентов.
- `contract websocket --out <path>` пишет generated TypeScript contract; без `--out` печатает его в stdout, а `--json` печатает stats.
- `@EbcaIO` считается декларативной may-use картой handler-а; CLI не исполняет handler и не строит IO из AST.
- CLI-entry остается внутри библиотеки; state-changing операции допустимы только через `ComponentManager`.
- CLI импортирует runtime metadata module проекта через `--runtime-module` или `EBCA_RUNTIME_MODULE`; библиотека не содержит список доменов проекта и вызывает `loadProjectRuntimeMetadata()`, если project module его экспортирует.
- Component admin commands не импортируют app module напрямую: project runtime module должен экспортировать `createEbcaComponentAdminTestingModule()`.
- CLI по умолчанию глушит debug-логи decorator registration; для диагностики используй `EBCA_CLI_DEBUG=1`.
- Если нужен owner handler для i.spec, сначала используй `links --component <CommandComponentName>`.
- Если нужно понять архитектурную цепочку без чтения десятков файлов, используй `report process --component <CommandComponentName> --depth 3`. Process идет по `emits` и command/due writes, но не раскрывает каждую обычную state write.
- Для обратного просмотра producers используй `report process --component <CommandComponentName> --direction reverse`; для одновременного просмотра входа и выхода используй `--direction both`.
- Если нужно проверить, где fan-out реально превращается в loop, используй `report cycles`; due/status-heavy cycles являются diagnostic-сигналом для чтения процесса, а не автоматическим архитектурным риском.
- Если граф обрывается после handler-а, используй `report io-coverage --domain <name>` и добивай `@EbcaIO` до trigger read, state writes, emitted output facts/commands и terminal command lifecycle.
- Class-only `@EbcaIO` target означает trigger entity. Для nested/cross-entity `ComponentManager` операций используй tuple `[EntityClass, ComponentClass]`, чтобы `links --with-io`, `graph --with-io` и boundary reports видели реальную target entity.
- Если нужно увидеть command surface, используй `report command-contracts --component <CommandComponentName>`.
- Если нужно проверить source-of-truth границы, используй `report boundary-risks` или `report multi-writers`; они показывают только пары `Entity + Component`, которые реально пишутся несколькими доменами.
- `report boundary-risks` и `report multi-writers` по умолчанию печатают компактный список пар, writer domains и handler count; для полной простыни handler-ов используй `--verbose`.
- Если нужно посмотреть шумные cross-domain/class-only декларации, используй `report boundary-diagnostics`; это diagnostic-слой для уточнения `@EbcaIO` и ownership inference, а не список обязательных архитектурных багов.
- Для output intent/fact используй `@EbcaIO({ emits: [...] })`; storage/state mutations остаются в `writes`.
- `report commands` и `report process` не считают запись того же command/due component следующим workflow-hop; это статус/lifecycle текущей команды.
- `report command-contracts` честно помечает `reason/failureDetails` как opaque, пока command-компоненты не имеют explicit runtime metadata для failure contracts.
- `report risks` использует runtime `isCommand`/`delayedBy`/inbound metadata для проверки, что command/due intent имеет одного `COMPONENT_ADDED` owner handler-а; workflow cycles смотрятся отдельным diagnostic-отчетом `report cycles`.
- `report boundary-risks` проверяет multi-writer domains для пары `Entity + Component`. `report boundary-diagnostics` отдельно показывает class-only cross-domain actor writes/removes, которые могут требовать tuple-формы или более явного ownership metadata. Здесь нет hardcoded project rules.
