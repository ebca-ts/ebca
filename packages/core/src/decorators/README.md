# Decorators

Runtime metadata decorators for EBCA.

## Files

- `entity.decorator.ts` registers entity classes and optional public names.
- `component.decorator.ts` registers component classes, permissions, inbound options, projection options, and delayed metadata.
- `system.decorator.ts` registers systems and applies NestJS controller metadata.
- `ebca-pattern.decorator.ts` registers lifecycle subscriptions and optional ordered-ingress rules.
- `ebca-io.decorator.ts` records declared handler IO for reports and architecture checks.
- `ebca-query.decorator.ts` registers read repositories, named queries, and query params.
- `ebca-contract.decorator.ts` registers explicit type and enum declarations for generated contracts.
- `persistent-property.decorator.ts` maps component properties to entity projection columns.
- `decorator-source-file.ts` records source file paths for registered classes.
- `metadata.storage.ts` wraps `reflect-metadata` access.

## Principle

Decorators describe the system. They do not execute business logic and they do not replace `ComponentManager`.
