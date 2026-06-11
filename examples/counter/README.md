# EBCA Counter Example

A runnable minimal EBCA service.

It starts a NestJS HTTP app and a NATS microservice in the same process. HTTP writes an `IncrementCounterCommandComponent` through `ComponentManager`; `CounterSystem` handles the EBCA lifecycle event from NATS and writes a persistent `CounterValueComponent`; HTTP reads the current component state back through `ComponentManager`.

The app also imports `@ebca/healthcheck`, so `GET /health` checks PostgreSQL, Redis, and NATS with the same runtime configuration.

## Run

From the repository root:

```bash
bun install
bun run build:all
bun run example:counter:infra
cp examples/counter/.env.example examples/counter/.env
bun run example:counter:build
bun run example:counter:start
```

In another terminal:

```bash
curl -X POST http://localhost:3000/counter/11111111-1111-4111-8111-111111111111/increment \
  -H 'content-type: application/json' \
  -d '{"amount": 3}'

curl http://localhost:3000/counter/11111111-1111-4111-8111-111111111111

curl http://localhost:3000/health
```

Expected shape:

```json
{
  "entityId": "11111111-1111-4111-8111-111111111111",
  "value": 3,
  "updatedAt": 1760000000000
}
```

Run the POST request again and the value increases through the same EBCA command path.

## Files

| File | Purpose |
| --- | --- |
| `src/counter.entity.ts` | EBCA entity stored by TypeORM. |
| `src/counter.components.ts` | Command and persistent state components. |
| `src/counter.system.ts` | EBCA system subscribed with `@EbcaPattern`. |
| `src/counter.controller.ts` | Thin HTTP adapter that writes and reads through `ComponentManager`. |
| `src/counter.module.ts` | Real NestJS wiring for PostgreSQL, Redis, NATS, and EBCA. |
| `docker-compose.yml` | Local PostgreSQL, Redis, and a 3-node JetStream-enabled NATS cluster. |

## Stop

```bash
bun run --cwd examples/counter infra:down
```
