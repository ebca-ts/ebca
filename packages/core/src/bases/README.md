# Base Classes

Minimal base abstractions used by EBCA runtime code.

- `base.entity.ts` defines `BaseEntity` with an `id` and persisted component snapshot storage.
- `base.component.ts` defines `BaseComponent` and persistent-property metadata access.
- `base-command.component.ts` defines command lifecycle status, source, rejection details, and helpers.

The base classes intentionally stay small. Domain meaning should be expressed by concrete components and systems in the consuming application.
