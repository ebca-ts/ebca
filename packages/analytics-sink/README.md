# @ebca/analytics-sink

Optional NestJS package for persisting EBCA lifecycle events into a TypeORM table.

It is a passive sink: it subscribes to `ebca.>` through the Nest microservice transport, buffers lifecycle messages, and writes them into `ecs_events`. It does not publish new lifecycle events and does not own domain state.

## Install

```bash
npm install @ebca/analytics-sink @ebca/core nats
```

Your application also needs NestJS, `@nestjs/microservices`, `@nestjs/typeorm`, and TypeORM configured normally. The default event entity uses a `jsonb` payload column, so it targets PostgreSQL-compatible TypeORM drivers such as PostgreSQL and CockroachDB.

## Usage

Import the module next to your TypeORM setup:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EbcaAnalyticsSinkModule } from '@ebca/analytics-sink';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
    }),
    EbcaAnalyticsSinkModule.register({
      batchSize: 100,
      flushIntervalMs: 5000,
    }),
  ],
})
export class AnalyticsModule {}
```

Then connect a NATS microservice in the application bootstrap:

```ts
import { Transport } from '@nestjs/microservices';

app.enableShutdownHooks();
app.connectMicroservice({
  transport: Transport.NATS,
  options: {
    servers: ['nats://localhost:4222'],
    queue: 'ebca-analytics-sink-queue',
  },
});
```

The package registers `EbcaAnalyticsEventEntity` with `TypeOrmModule.forFeature`. Use `autoLoadEntities: true` or include the entity in your TypeORM entities list.

## Stored Record

Each lifecycle message becomes one row:

| Column | Source |
| --- | --- |
| `event_timestamp` | Sink receive time. |
| `event_type` | Topic lifecycle segment: `added`, `updated`, or `removed`. |
| `entity_name` | Topic entity segment. |
| `entity_id` | Topic entity id segment. |
| `component_name` | Topic component segment. |
| `component_payload` | `payload.component` or `payload.previousComponent` serialized as JSON. |

The default table name is `ecs_events`.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `batchSize` | `100` | Flush when the in-memory buffer reaches this size. |
| `flushIntervalMs` | `5000` | Periodic flush interval. |
| `maxBufferSize` | unlimited | Optional hard cap for buffered events during database outages. |
| `verboseFlushLog` | `false` | Emit verbose logs for successful flushes. |

On a failed write, the package puts the batch back at the head of the buffer and retries on the next threshold or interval. If `maxBufferSize` is configured, new events are dropped with error logs after the buffer reaches the cap. Events buffered only in memory can still be lost if the process is killed before a successful flush.
