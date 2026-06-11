# @ebca/healthcheck

Optional NestJS health endpoint for EBCA applications.

The package exposes `EbcaHealthcheckModule`, a small module that checks the dependencies EBCA services normally need: TypeORM database connectivity, Redis, and NATS.

It is intentionally separate from `@ebca/core`, so applications that do not want an HTTP health endpoint do not inherit extra transport surface.

## Install

```bash
npm install @ebca/healthcheck
```

Peer dependencies are supplied by the application: NestJS, `@nestjs/config`, TypeORM, NATS, Redis, RxJS, and reflect-metadata.

## Usage

```ts
import { Module } from '@nestjs/common';
import { EbcaHealthcheckModule } from '@ebca/healthcheck';

@Module({
  imports: [
    EbcaHealthcheckModule.register(),
  ],
})
export class AppModule {}
```

The module registers `GET /health`.

Default configuration keys:

| Key | Purpose |
| --- | --- |
| `HEALTHCHECK_TIMEOUT_MS` | Per-dependency timeout. Defaults to `5000`. |
| `REDIS_URL` | Redis URL. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DATABASE` | Redis fallback when `REDIS_URL` is not set. |
| `NATS_SERVERS` | Comma-separated string or string array. |

## Options

```ts
EbcaHealthcheckModule.register({
  checks: {
    database: true,
    redis: true,
    nats: true,
  },
  timeoutMs: 3000,
  redis: {
    urlConfigKey: 'CACHE_REDIS_URL',
  },
  nats: {
    serversConfigKey: 'MESSAGING_NATS_SERVERS',
  },
});
```

The response has stable shape:

```json
{
  "status": "ok",
  "checkedAt": "2026-06-11T10:00:00.000Z",
  "dependencies": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 4 },
    "nats": { "status": "ok", "latencyMs": 3 }
  }
}
```

When any enabled dependency fails, the endpoint returns HTTP `503` with the same report shape.

## License

Apache-2.0.
