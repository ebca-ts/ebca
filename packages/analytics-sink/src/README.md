# Analytics Sink Source

This package contains the reusable NestJS analytics sink for EBCA lifecycle events.

| File | Purpose |
| --- | --- |
| `ebca-analytics-sink.module.ts` | Dynamic module entrypoint and TypeORM feature registration. |
| `ebca-analytics-sink.system.ts` | `@EventPattern('ebca.>')` controller, topic parsing, buffering, and flush lifecycle. |
| `ebca-analytics-event.entity.ts` | Default TypeORM entity for the `ecs_events` table. |
| `ebca-analytics-sink.types.ts` | Public option and event payload contracts, including the optional buffer cap. |
| `ebca-analytics-sink.constants.ts` | Provider token and defaults. |

Applications provide the NATS transport connection in their bootstrap, enable shutdown hooks for final flushes, and include a PostgreSQL-compatible TypeORM root module in their module graph.
