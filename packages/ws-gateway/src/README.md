# @ebca/ws-gateway/src

Socket.IO/NestJS gateway implementation for EBCA.

## Files

- `ebca-ws-gateway.module.ts` creates the dynamic NestJS module and normalizes options.
- `ebca-ws.gateway.ts` owns socket identity, client events, and outbound envelopes.
- `ebca-ws-projector.controller.ts` subscribes to EBCA lifecycle events and forwards exposed projections.
- `services/` contains component mutation, component request, projection, and query services.
- `types/` contains public gateway contracts and module options.
- `utils/` contains JSON serialization helpers.

## Boundary

The gateway knows EBCA metadata and Socket.IO envelopes. Authentication, custom filtering, and domain-specific policy stay in consuming application providers.
