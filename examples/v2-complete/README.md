# V2 Complete Example

A complete example demonstrating the Lens API framework with all features.

## Features

- Entity definitions with relations (`hasMany`, `belongsTo`)
- Type-safe queries and mutations
- Optimistic updates with DSL
- Server with in-memory mock database
- Client with WebSocket transport

## Running

```bash
# Start server
bun run dev

# In another terminal, run client
bun run client
```

## Testing

```bash
bun test
```

## Structure

- `schema.ts` - Entity definitions and relations
- `operations.ts` - Query and mutation definitions
- `server.ts` - Server setup with context and resolvers
- `client.ts` - Client usage examples
- `server.test.ts` - Integration tests

## Dependencies

This example uses workspace packages:
- `@sylphx/lens-core` - Core schema types and utilities
- `@sylphx/lens-server` - Server runtime
- `@sylphx/lens-client` - Reactive client
