# @ebca/gql-gateway

GraphQL gateway for EBCA read repositories, inbound components, snapshots, and live projections.

`@ebca/gql-gateway` exposes the same EBCA application surface as the WebSocket gateway without putting GraphQL runtime concerns into `@ebca/core`. The default package is transport-neutral: it validates `@EbcaQuery({ gates: ['gql'] })`, writes exposed inbound components, resolves projected component snapshots, filters lifecycle projections, and returns JSON-ready payloads.

An optional NestJS GraphQL bridge is available at `@ebca/gql-gateway/nestjs`.

## Install

```bash
npm install @ebca/gql-gateway typeorm
```

For the optional NestJS GraphQL bridge:

```bash
npm install @ebca/gql-gateway typeorm @nestjs/graphql @nestjs/microservices graphql
```

## Query Gateway

```ts
import { EbcaGqlGatewayModule } from '@ebca/gql-gateway';

EbcaGqlGatewayModule.forRoot({
  defaultRoles: ['user'],
});
```

The consuming application decides how to authenticate GraphQL requests. The gateway receives an already authenticated EBCA identity and request id from the resolver layer.

## Optional NestJS GraphQL Bridge

```ts
import { EbcaGqlNestjsModule } from '@ebca/gql-gateway/nestjs';

EbcaGqlNestjsModule.forRoot({
  identityResolver: AppGraphqlIdentityResolver,
  ebca: {
    defaultRoles: ['user'],
  },
});
```

The bridge provides:

- `EbcaJson` scalar;
- generic `ebcaQuery(input)` field;
- generic `ebcaComponentMutation(input)` field;
- generic `ebcaComponentRequest(input)` field;
- generic `ebcaComponent(input)` subscription;
- identity resolver injection;
- call-through to the neutral gateway services.

## Query Declaration

```ts
import { EbcaQuery, EbcaQueryParam, EbcaReadRepository } from '@ebca/core';

class OrdersParams {
  @EbcaQueryParam({ required: true })
  readonly accountId!: string;
}

interface OrderSummary {
  readonly id: string;
  readonly status: string;
}

@EbcaReadRepository()
export class OrdersReadRepository {
  @EbcaQuery({
    name: 'orders',
    params: OrdersParams,
    gates: ['gql'],
  })
  async orders(params: OrdersParams): Promise<readonly OrderSummary[]> {
    return [];
  }
}
```

## Realtime Components

GraphQL component subscriptions use the same component projection metadata as the WebSocket gateway:

```ts
@Component({
  websocket: {
    expose: true,
    audience: 'owner',
    ownerField: 'playerId',
  },
})
export class InventoryComponent extends BaseComponent {}
```

The NestJS bridge listens to EBCA lifecycle topics, applies the same audience and policy rules, and emits `ebcaComponent(input)` events to matching GraphQL subscribers. Component snapshots use `ebcaComponentRequest(input)` and the same projection visibility.

Inbound GraphQL mutations use `@Component({ inbound: { expose: true, fields: [...] } })`, exactly like REST and WebSocket inbound writes. For owner-scoped writes, GraphQL validates ownership through `ownerComponent`; owner fields copied from the client payload are not trusted.

## Why This Is Useful

GraphQL often creates a parallel DTO/service layer. EBCA keeps the read-side contract close to the read repository:

- params are declared once;
- validation lives in EBCA metadata;
- multiple transports can reuse the same query;
- domain reads can be shared across apps;
- live component visibility is declared once;
- generated contracts and runtime reports see the same surface.

The package keeps GraphQL as an adapter, not the owner of business logic.

## Build

```bash
bun run build
```

This builds the transport-neutral query gateway.
The neutral gateway imports TypeORM for collection snapshot reads.

```bash
bun run build:nestjs
```

This builds the optional `@ebca/gql-gateway/nestjs` subpath and requires `@nestjs/graphql` plus `graphql`.
The NestJS bridge also uses `@nestjs/microservices` to receive EBCA lifecycle events for subscriptions.

## License

Apache-2.0.
