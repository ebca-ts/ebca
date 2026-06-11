# @ebca/rest-gateway

Optional REST adapter for EBCA applications.

The package exposes generic HTTP endpoints for the same declarative runtime metadata used by the other EBCA gateways:

- inbound components marked with `@Component({ inbound: { expose: true } })`;
- read queries marked with `@EbcaQuery({ gates: ['rest'] })`.

It also exports `setupEbcaRestSwagger`, a small helper that installs Swagger UI for the generic REST contract.

## Install

```bash
npm install @ebca/rest-gateway @nestjs/swagger
```

`@ebca/core`, NestJS, reflect-metadata, and RxJS are peer dependencies supplied by the application.

## Usage

```ts
import { Module } from '@nestjs/common';
import { EbcaRestAuthAdapter, EbcaRestGatewayModule } from '@ebca/rest-gateway';

class AppRestAuthAdapter implements EbcaRestAuthAdapter {
  resolveIdentity() {
    return { identityId: 'system-rest-client', roles: ['operator'] };
  }
}

@Module({
  imports: [
    EbcaRestGatewayModule.forRoot({
      authAdapter: AppRestAuthAdapter,
    }),
  ],
})
export class AppModule {}
```

In `main.ts`:

```ts
import { setupEbcaRestSwagger } from '@ebca/rest-gateway';

setupEbcaRestSwagger(app, {
  path: 'docs',
  title: 'EBCA API',
});
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/ebca/components/:entityName/:entityId/:componentName/:operation` | Add, update, upsert, or remove an exposed component. |
| `GET` | `/ebca/queries/:name` | Execute a read query using URL query params. |
| `POST` | `/ebca/queries/:name` | Execute a read query using JSON params. |
| `GET` | `/ebca/meta` | Inspect REST-open queries and inbound components. |

## Security

REST gateway is transport glue, not an authentication framework. Use `authAdapter` to map your app-owned HTTP auth into an EBCA identity and roles. Without an adapter, the gateway uses only `defaultIdentityId` and `defaultRoles`; it does not trust arbitrary request headers.

For writes, exposed components must declare `inbound.fields`. Those fields are the REST mutation contract and keep framework/domain fields such as command status, rejection details, and internal identifiers out of arbitrary JSON payloads.

REST stays an adapter. Domain decisions still live in EBCA systems and read repositories.

## License

Apache-2.0.
