# @ebca/gql-gateway

GraphQL-facing query execution for EBCA read repositories.

`@ebca/gql-gateway` exposes EBCA read queries to GraphQL without putting GraphQL runtime concerns into `@ebca/core`. The default package is transport-neutral: it validates `@EbcaQuery({ gates: ['gql'] })`, builds typed param classes from `@EbcaQueryParam`, executes the read repository through NestJS DI, and returns JSON-ready payloads.

An optional NestJS GraphQL bridge is available at `@ebca/gql-gateway/nestjs`.

## Install

```bash
npm install @ebca/gql-gateway
```

For the optional NestJS GraphQL bridge:

```bash
npm install @ebca/gql-gateway @nestjs/graphql graphql
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
- identity resolver injection;
- call-through to `EbcaGqlQueryService`.

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

## Why This Is Useful

GraphQL often creates a parallel DTO/service layer. EBCA keeps the read-side contract close to the read repository:

- params are declared once;
- validation lives in EBCA metadata;
- multiple transports can reuse the same query;
- domain reads can be shared across apps;
- generated contracts and runtime reports see the same surface.

The package keeps GraphQL as an adapter, not the owner of business logic.

## Build

```bash
bun run build
```

This builds the transport-neutral query gateway.

```bash
bun run build:nestjs
```

This builds the optional `@ebca/gql-gateway/nestjs` subpath and requires `@nestjs/graphql` plus `graphql`.

## License

Apache-2.0.
