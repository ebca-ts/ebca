# @ebca/core/src

Core runtime implementation for EBCA.

## Public Entry Points

- `index.ts` exports the package API.
- `ebca.module.ts` exposes the NestJS module.
- `component.manager.ts` is the single component read/write path.
- `persistence.manager.ts` handles JSONB component storage and column projections.
- `delayed-stream.bootstrap.ts` prepares delayed NATS streams.
- `ordered-ingress.registry.ts` and `ordered-ingress.service.ts` implement opt-in ordered command ingress.
- `ebca.helpers.ts` contains lifecycle topics, names, and serialization helpers.

## Folders

- `bases/` contains `BaseEntity`, `BaseComponent`, and `BaseCommandComponent`.
- `decorators/` contains runtime metadata decorators and registries.
- `types/` contains public contracts used by decorators, managers, gateways, and tooling.

## Boundaries

This package owns framework mechanics only. Domain rules, transport-specific authentication, and user-facing presentation belong in the consuming application or optional adapter packages.
