# @ebca/cli/src

Implementation files for the EBCA command-line tooling.

## Files

- `cli.ts` parses commands and loads the consuming project's runtime module.
- `runtime-inspector.ts` builds the runtime registry snapshot.
- `runtime-graph.ts` renders registry links as Mermaid or Graphviz DOT.
- `runtime-report.ts` builds higher-level architecture reports.
- `websocket-contract-generator.ts` generates TypeScript transport contracts.
- `graphql-contract-generator.ts` generates TypeScript contracts for GraphQL generic EBCA fields.
- `graphql-query-contract-renderer.ts` renders GraphQL query params and result payloads.
- `websocket-contract-ast.ts` resolves component/type shapes from registered source files.
- `websocket-contract-source-files.ts` follows local imports from registered declarations.
- `websocket-query-contract-renderer.ts` renders query params and result payloads.
- `admin-component-crud.ts` runs operator component commands through `ComponentManager`.
- `testing-module.ts` compiles registered systems as NestJS controllers for inspection.

## Rules

- Runtime registry metadata is the source of truth.
- Contract declarations come from `@EbcaType` and `@EbcaEnum`.
- The CLI does not hardcode project source roots.
- Component admin commands require a project-provided testing module factory.
- State-changing commands must still go through `ComponentManager`.
