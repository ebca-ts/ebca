# @ebca/cli

Runtime inspection and contract generation for EBCA applications.

`@ebca/cli` reads the metadata registered by `@ebca/core` decorators and turns a running or importable EBCA application into reports, graphs, ownership diagnostics, and generated transport contracts.

It is built for large event-driven systems where the architecture should be queryable instead of tribal knowledge.

## Install

```bash
npm install --save-dev @ebca/cli
```

The CLI expects a project runtime module that imports/registers the application's EBCA entities, components, systems, read repositories, and contract declarations.

## Why It Exists

EBCA systems describe themselves at runtime. The CLI makes that metadata useful:

- see which systems listen to which lifecycle topics;
- inspect command workflows;
- find fan-out and multi-writer risks;
- check `@EbcaIO` coverage;
- generate transport contracts from registered entities, components, queries, types, and enums;
- give AI agents a compact architecture map before they edit code.

## Usage

Pass a runtime metadata module explicitly:

```bash
ebca report summary --runtime-module ./src/runtime.module.ts
```

Or set it once in an npm script:

```json
{
  "scripts": {
    "ebca": "EBCA_RUNTIME_MODULE=./src/runtime.module.ts ebca"
  }
}
```

Then run:

```bash
npm run ebca -- registry --json
npm run ebca -- links --with-io
npm run ebca -- graph --component PlaceOrderCommandComponent
npm run ebca -- report summary
npm run ebca -- report process --component PlaceOrderCommandComponent --depth 4
npm run ebca -- report boundary-risks
npm run ebca -- contract websocket --out ./src/contracts/ebca.generated.ts
```

## Runtime Module Contract

A runtime module is project-owned. It should import the files that register EBCA decorators.

```ts
import './components/register-components';
import './systems/order.system';
import './queries/order-book.repository';

export async function loadProjectRuntimeMetadata(): Promise<void> {
  await import('./orders/order.module');
}
```

For component admin commands, the runtime module can also export a testing-module factory:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

export async function createEbcaComponentAdminTestingModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [AppModule],
  }).compile();
}
```

The CLI never hardcodes your app folders or domain names.

## Reports

| Command | Purpose |
| --- | --- |
| `registry` | Dump registered entities, components, systems, patterns, and queries. |
| `links` | List `entity + event + component -> system.handler` subscriptions. |
| `graph` | Render links as Mermaid or Graphviz DOT. |
| `report summary` | Compact overview of the runtime graph. |
| `report process` | Follow a command/fact workflow through emitted components. |
| `report owners` | Show who listens to, reads, writes, emits, or removes a component. |
| `report risks` | Find structural risks such as unhandled commands or hot fan-out. |
| `report boundary-risks` | Detect generic multi-writer ownership problems. |
| `report io-coverage` | Find handlers missing useful `@EbcaIO` declarations. |
| `contract websocket` | Generate a TypeScript transport contract for WebSocket consumers. |

## Contract Generation

Generated contracts are based on runtime metadata:

- `@Entity` and `@Component` provide entity/component names.
- Component source files provide payload shapes.
- `@EbcaQuery` and `@EbcaQueryParam` provide query names and params.
- `@EbcaType` and `@EbcaEnum` explicitly opt types/enums into generated contracts.
- Command component contracts include status, source (`system`, `websocket`, `rest`, `graphql`), rejection reason, and failure details.

The CLI does not accept project-specific `componentsRoot` or `enumsRoot` paths. If a type should be part of a generated contract, register it.

## Component Admin

The `component get|add|update|upsert|remove` commands call the real `ComponentManager` from your project module. They are intended for operator/debug use and should not become normal business workflows.

## License

Apache-2.0.
