# @ebca/gql-gateway/src

GraphQL-facing query gateway implementation.

## Files

- `ebca-gql-gateway.module.ts` creates the dynamic NestJS module.
- `ebca-gql-gateway.ts` exports the transport-neutral package API.
- `services/ebca-gql-query.service.ts` executes EBCA read queries opened to the `gql` gate.
- `types/` contains JSON payload, identity, context, and module option contracts.
- `utils/` contains JSON serialization helpers.
- `nestjs/` contains the optional NestJS GraphQL bridge exported as `@ebca/gql-gateway/nestjs`.

## Boundary

The neutral gateway does not import `@nestjs/graphql`. GraphQL schema/context handling belongs in the optional bridge or in the consuming application.
