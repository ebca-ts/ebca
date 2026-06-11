# REST Gateway Source

This package adapts EBCA runtime metadata to HTTP.

| File | Purpose |
| --- | --- |
| `ebca-rest-gateway.module.ts` | Dynamic NestJS module wiring. |
| `ebca-rest-gateway.controller.ts` | Generic REST controller and Swagger decorators. |
| `ebca-rest-swagger.ts` | Swagger document setup helper. |
| `services/ebca-rest-component-mutation.service.ts` | Inbound component writes through `ComponentManager`. |
| `services/ebca-rest-query.service.ts` | `@EbcaQuery(gates: ['rest'])` execution. |
| `types/` | Public request, response, and option contracts. |
| `utils/` | JSON serialization helpers. |

`authAdapter` belongs to the consuming app. REST write components must declare `inbound.fields`; query params come from `@EbcaQueryParam` metadata.

Business rules stay in EBCA systems and read repositories.
