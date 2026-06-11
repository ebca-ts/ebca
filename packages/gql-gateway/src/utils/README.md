# GraphQL Gateway Utils

- `ebca-gql-json.ts` converts serializable query results, component snapshots, and projection payloads into JSON-ready values.

The helper intentionally uses standard JSON serialization semantics so `Date` values and plain snapshots leave the gateway predictably.
