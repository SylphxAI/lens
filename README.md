# Lens

> **The Reactive Graph API Framework**

TypeScript-first • Real-time Native • Zero Config

```typescript
// Define your schema
const schema = createSchema({
  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),
    author: t.belongsTo('User'),
  },
});

// Use it reactively
const post = api.post.get({ id });
<div>{post.value.title}</div>  // Auto-updates, even streaming!
```

---

## Why Lens?

### The Problem

Building real-time, type-safe APIs is hard:

- **GraphQL**: Powerful but requires codegen, verbose, no native streaming
- **tRPC**: Great DX but no field selection, no real-time, manual everything
- **REST**: No type safety, over-fetching, manual subscriptions

### The Solution

Lens combines the best of all worlds:

| Feature | GraphQL | tRPC | **Lens** |
|---------|---------|------|----------|
| Type Safety | Codegen | ✅ | ✅ |
| Field Selection | ✅ | ❌ | ✅ |
| Real-time | Addon | Manual | **Native** |
| Streaming | ❌ | ❌ | **Native** |
| Optimistic Updates | Manual | Manual | **Auto** |
| Configuration | Heavy | Medium | **Zero** |

---

## Quick Start

### Installation

```bash
bun add @lens/core @lens/server @lens/client @lens/react
```

### Server

```typescript
// schema.ts
import { createSchema, t } from '@lens/core';

export const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    email: t.string(),
    posts: t.hasMany('Post'),
  },
  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),
    author: t.belongsTo('User'),
  },
});

// resolvers.ts
import { createResolvers } from '@lens/server';

export const resolvers = createResolvers(schema, {
  User: {
    resolve: (id, ctx) => ctx.db.user.findUnique({ where: { id } }),
    batch: (ids, ctx) => ctx.db.user.findMany({ where: { id: { in: ids } } }),
  },
  Post: {
    resolve: (id, ctx) => ctx.db.post.findUnique({ where: { id } }),
    batch: (ids, ctx) => ctx.db.post.findMany({ where: { id: { in: ids } } }),
  },
});

// server.ts
import { createServer } from '@lens/server';

const server = createServer({ schema, resolvers });
server.listen(3000);
```

### Client

```typescript
// api.ts
import { createClient } from '@lens/client';
import type { schema } from './schema';

export const api = createClient<typeof schema>({
  url: 'ws://localhost:3000',
});
```

### React

```tsx
// App.tsx
import { LensProvider, useEntity, useList, useMutation } from '@lens/react';
import { api } from './api';

// Wrap your app with the provider
function App() {
  return (
    <LensProvider client={api}>
      <UserProfile userId="123" />
    </LensProvider>
  );
}

// Use hooks to access data
function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading, error } = useEntity('User', { id: userId });
  const { mutate: updateUser } = useMutation('User', 'update');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <button onClick={() => updateUser({ id: userId, name: 'New Name' })}>
        Update Name
      </button>
    </div>
  );
}

// List entities
function PostList() {
  const { data: posts, loading } = useList('Post', {
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

---

## Features

### 🔄 Everything is Reactive

```typescript
const post = api.post.get({ id });

// post.value updates automatically when:
// - Server pushes updates
// - LLM streams content
// - Database changes
// - Other users make changes
```

### 📡 Transparent Streaming

```typescript
// Same API for static and streaming data
const message = api.message.get({ id });

// If server is streaming (e.g., LLM response):
// message.value.content updates character by character
// No special handling needed!
```

### ⚡ Automatic Optimistic Updates

```typescript
// Mutation
await api.post.update({ id: '123', title: 'New Title' });

// UI updates immediately
// Automatically rolls back on error
// Zero configuration
```

### 🎯 Smart Field Selection

```typescript
// Only fetch what you need
const user = api.user.get({ id }, {
  select: { name: true, avatar: true }
});
// Type: Signal<{ name: string; avatar: string } | null>

// Automatic optimization:
// - If full user in cache → compute from cache
// - If not → fetch only selected fields
```

### 🔗 Automatic Relation Resolution

```typescript
const user = api.user.get({ id });
const posts = computed(() => user.value?.posts);

// posts automatically resolves from the graph
// N+1 queries are automatically batched
```

### 📦 Minimal Transfer

```typescript
// Automatic strategy selection:
// - Short strings → full value
// - Long strings → delta (character diffs)
// - Objects → JSON patch
// - Arrays → patch operations

// ~57-99% bandwidth savings
```

---

## Documentation

- [Architecture](./ARCHITECTURE.md) - Design philosophy and unified model
- [API Reference](./docs/API.md) - Complete API documentation
- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Progress and roadmap

---

## Status

| Component | Status |
|-----------|--------|
| Schema & Types | ✅ Complete |
| Client (Reactive Store) | ✅ Complete |
| Server (Resolvers) | 🟡 90% |
| React Hooks | ✅ Complete |
| Plugins (8 built-in) | ✅ Complete |
| Tests (377) | ✅ Passing |

**Next**: GraphStateManager for unified emit/yield/return → client sync

---

## Packages

| Package | Description |
|---------|-------------|
| `@lens/core` | Schema types, utilities, shared code |
| `@lens/server` | Resolvers, graph execution, handlers |
| `@lens/client` | Reactive store, signals, transport |
| `@lens/react` | React hooks and bindings |

---

## Philosophy

```
Schema = Shape (WHAT the data looks like)
Resolver = Implementation (HOW to get data)
Client = Access (USE the data reactively)

Everything else is automatic.
```

---

## License

MIT © Sylphx AI
