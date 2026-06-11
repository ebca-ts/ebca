# @ebca/ws-gateway

Optional WebSocket gateway for EBCA component projection, mutation, requests, and read queries.

`@ebca/ws-gateway` connects Socket.IO/NestJS clients to the declarative surface provided by `@ebca/core`. It does not contain domain rules. It reads EBCA metadata, validates inbound component access, calls `ComponentManager`, and projects exposed lifecycle events to connected identities.

## Install

```bash
npm install @ebca/ws-gateway
```

Peer dependencies include `@ebca/core`, NestJS, Socket.IO, TypeORM, and NestJS microservices.

## What It Does

- Accepts generic component mutations from clients.
- Validates `ComponentOptions.inbound`.
- Supports component batch requests by entity or collection target.
- Projects lifecycle updates for components exposed through `ComponentOptions.websocket`.
- Executes read queries declared with `@EbcaQuery({ gates: ['ws'] })`.
- Keeps auth, identity lookup, custom filtering, and domain policy in the consuming app.

## Basic Setup

```ts
import { EbcaWsGatewayModule } from '@ebca/ws-gateway';

EbcaWsGatewayModule.forRoot({
  namespace: '/app',
  identityField: 'accountId',
  identityEntityName: 'AccountEntity',
  defaultRoles: ['user'],
  authAdapter: AppSocketAuthAdapter,
});
```

`identityId` is the internal EBCA identity name. `identityField` controls the public envelope field, so a project can expose `accountId`, `playerId`, `tenantId`, or another domain-specific name without changing the gateway internals.

## Client Events

| Event | Purpose |
| --- | --- |
| `client.hello` | Attach a socket to the authenticated identity room. |
| `client.component` | Add/update/upsert/remove an exposed inbound component. |
| `client.component.request` | Request exposed components for one entity or a collection. |
| `client.query` | Execute an EBCA read query exposed to the `ws` gate. |
| `server.component` | Receive projected component lifecycle updates. |
| `server.query.result` | Receive query results. |
| `server.error` | Receive transport-level protocol or validation errors. |

## Extension Points

The consuming app can provide:

- auth adapters;
- inbound normalizers;
- projection policies;
- audience resolvers;
- custom identity field naming;
- default roles.

That keeps WebSocket code boring and domain logic explicit.

## Why This Is Useful

Many realtime systems grow separate APIs for commands, snapshots, events, and read models. EBCA lets the WebSocket boundary stay generic:

- Commands are component mutations.
- Results are component lifecycle.
- Snapshots are component requests.
- Lists and dashboards are declared read queries.
- Client contracts can be generated from the same metadata.

This makes frontend/backend integration easier to inspect and easier for AI agents to update without inventing hidden transport-specific business logic.

## License

Apache-2.0.
