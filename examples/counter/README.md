# EBCA Counter Example

A runnable minimal EBCA service.

It starts a NestJS HTTP app and a NATS microservice in the same process. REST writes an `IncrementCounterCommandComponent` through `@ebca/rest-gateway`; `CounterSystem` handles the EBCA lifecycle event from NATS and writes a persistent `CounterValueComponent`; REST reads the current component state through a declared `@EbcaReadRepository`.

The app also imports `@ebca/healthcheck`, so `GET /health` checks PostgreSQL, Redis, and NATS with the same runtime configuration. Swagger UI is available at `http://localhost:3000/docs`.

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
curl -X POST http://localhost:3000/ebca/components/CounterEntity/11111111-1111-4111-8111-111111111111/IncrementCounterCommandComponent/add \
  -H 'content-type: application/json' \
  -d '{"component":{"amount":3}}'

curl 'http://localhost:3000/ebca/queries/counterState?entityId=11111111-1111-4111-8111-111111111111'

curl http://localhost:3000/health
```

Expected shape:

```json
{
  "kind": "query.result",
  "name": "counterState",
  "result": {
    "entityId": "11111111-1111-4111-8111-111111111111",
    "value": 3,
    "updatedAt": 1760000000000
  }
}
```

Run the POST request again and the value increases through the same EBCA command path.

## Files

| File | Purpose |
| --- | --- |
| `src/counter.entity.ts` | EBCA entity stored by TypeORM. |
| `src/counter.components.ts` | Command and persistent state components. |
| `src/counter.system.ts` | EBCA system subscribed with `@EbcaPattern`. |
| `src/counter.read-repository.ts` | REST-open `@EbcaQuery` read model. |
| `src/counter.module.ts` | Real NestJS wiring for PostgreSQL, Redis, NATS, and EBCA. |
| `docker-compose.yml` | Local PostgreSQL, Redis, and a 3-node JetStream-enabled NATS cluster. |

The command component exposes only the `amount` field through REST; command status/source/id stay framework-owned.

## Stop

```bash
bun run --cwd examples/counter infra:down
```
