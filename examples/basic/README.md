# Lens Basic Example

A simple example demonstrating Lens with React.

## Setup

```bash
# Install dependencies
bun install

# Start the server (in one terminal)
bun run server

# Start the dev server (in another terminal)
bun run dev
```

## Files

- `schema.ts` - Schema definition with User and Post entities
- `server.ts` - Lens server with in-memory database
- `client.ts` - Typed Lens client
- `App.tsx` - React components using Lens hooks

## Features Demonstrated

### Schema Definition
```typescript
const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    posts: t.hasMany('Post'),
  },
  Post: {
    id: t.id(),
    title: t.string(),
    author: t.belongsTo('User'),
  },
});
```

### React Hooks
```tsx
// Single entity
const { data, loading, error } = useEntity('User', { id: '123' });

// List of entities
const { data: posts } = useList('Post', { where: { published: true } });

// Mutations
const { mutate, loading } = useMutation('User', 'update');
await mutate({ id: '123', name: 'New Name' });
```

### Server Resolvers
```typescript
const resolvers = createResolvers(schema, {
  User: {
    resolve: (id) => db.users.get(id),
    batch: (ids) => ids.map(id => db.users.get(id)),
    create: (input) => { /* ... */ },
    update: (input) => { /* ... */ },
    delete: (id) => { /* ... */ },
  },
});
```
