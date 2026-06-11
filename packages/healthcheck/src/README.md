# Healthcheck Source

This package exposes a small NestJS health endpoint.

| File | Purpose |
| --- | --- |
| `healthcheck.module.ts` | Dynamic module entrypoint and provider wiring. |
| `healthcheck.controller.ts` | `GET /health` HTTP adapter. |
| `healthcheck.service.ts` | Database, Redis, and NATS checks. |
| `healthcheck.types.ts` | Public option and report contracts. |
| `healthcheck.constants.ts` | Internal provider token. |

The service stays domain-agnostic. Applications provide TypeORM, ConfigService, Redis, and NATS dependencies through their normal NestJS module graph.
