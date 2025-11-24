# Lens

> **The Reactive Graph API Framework**

TypeScript-first • Real-time Native • Zero Codegen

```typescript
// Code-first: define schema in TypeScript, types are inferred
const schema = createSchema({
  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),
    createdAt: t.datetime(),
    author: t.belongsTo('User'),
  },
});

// Use reactively
const post = client.Post.get("123");
post.value.title  // Auto-updates in real-time!
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
| Code-first | SDL-first | ✅ | ✅ |
| Field Selection | ✅ | ❌ | ✅ |
| Real-time | Addon | Manual | **Native** |
| Streaming | ❌ | ❌ | **Native** |
| Optimistic Updates | Manual | Manual | **Auto** |
| Codegen Required | Yes | No | **No** |

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Schema Definition](#schema-definition)
- [Server Setup](#server-setup)
- [Client Usage](#client-usage)
- [Links (Middleware)](#links-middleware)
- [Reactive System](#reactive-system)
- [Framework Integration](#framework-integration)
- [Advanced Features](#advanced-features)
- [Complete Example](#complete-example)
- [API Reference](#api-reference)

---

## Installation

```bash
# Core packages
bun add @lens/core @lens/server @lens/client

# Framework adapters (choose one or more)
bun add @lens/react      # React hooks
bun add @lens/vue        # Vue composables
bun add @lens/svelte     # Svelte stores
```

---

## Quick Start

### 1. Define Schema

```typescript
// schema.ts
import { createSchema, t } from '@lens/core';

export const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    email: t.string(),
    avatar: t.string().optional(),
    posts: t.hasMany('Post'),
    createdAt: t.datetime(),
  },
  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),
    published: t.boolean(),
    author: t.belongsTo('User'),
    createdAt: t.datetime(),
  },
});

export type Schema = typeof schema;
```

### 2. Setup Server

```typescript
// server.ts
import { createServer, createResolvers } from '@lens/server';
import { schema } from './schema';

const resolvers = createResolvers(schema, {
  User: {
    resolve: (id, ctx) => ctx.db.user.findUnique({ where: { id } }),
    batch: (ids, ctx) => ctx.db.user.findMany({ where: { id: { in: ids } } }),
    create: (input, ctx) => ctx.db.user.create({ data: input }),
    update: (input, ctx) => ctx.db.user.update({ where: { id: input.id }, data: input }),
    delete: (id, ctx) => ctx.db.user.delete({ where: { id } }).then(() => true),
  },
  Post: {
    resolve: (id, ctx) => ctx.db.post.findUnique({ where: { id } }),
    batch: (ids, ctx) => ctx.db.post.findMany({ where: { id: { in: ids } } }),
  },
});

const server = createServer({
  schema,
  resolvers,
  context: () => ({ db: prisma }), // Your database client
});

server.listen(3000);
console.log('Lens server running on ws://localhost:3000');
```

### 3. Create Client

```typescript
// client.ts
import { createClient } from '@lens/client';
import type { Schema } from './schema';

export const client = createClient<Schema>({
  url: 'ws://localhost:3000',
});
```

### 4. Use in React

```tsx
// App.tsx
import { client } from './client';

function UserProfile({ userId }: { userId: string }) {
  // Get single entity
  const user = client.User.get(userId);

  // Subscribe to updates
  const unsubscribe = user.subscribe((data) => {
    console.log('User updated:', data);
  });

  // Or use as promise
  const userData = await user;

  return <div>{user.value?.name}</div>;
}

// With React hooks
import { useEntity, useMutation } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading } = useEntity('User', { id: userId });
  const { mutate: updateUser } = useMutation('User', 'update');

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={() => updateUser({ id: userId, name: 'New Name' })}>
        Update
      </button>
    </div>
  );
}
```

---

## Core Concepts

### 1. Code-first Schema

Define your schema in TypeScript — **no SDL, no codegen, full type inference**.

```typescript
const schema = createSchema({
  Post: {
    id: t.id(),              // Required ID field
    title: t.string(),       // String field
    views: t.int().optional(), // Optional number
    createdAt: t.datetime(), // Date field (auto-serialized)
  },
});

// Types are automatically inferred
type Post = InferEntity<typeof schema.definition.Post>;
// { id: string; title: string; views?: number; createdAt: Date }
```

### 2. Resolvers = Implementation

Resolvers define **how** to fetch data. Three patterns available:

```typescript
// Pattern 1: Return (Promise) - Single value
resolve: async (id, ctx) => {
  return await ctx.db.post.findUnique({ where: { id } });
}

// Pattern 2: Yield (Async Generator) - Multiple values
resolve: async function* (id, ctx) {
  yield { id, title: "Version 1" };
  await sleep(1000);
  yield { id, title: "Version 2" };
  await sleep(1000);
  yield { id, title: "Final" };
}

// Pattern 3: ctx.emit() - Event-driven updates
resolve: async (id, ctx) => {
  const initial = await ctx.db.post.findUnique({ where: { id } });

  // Listen to external events
  redis.subscribe(`post:${id}`, (update) => {
    ctx.emit(update); // Push to subscribed clients
  });

  ctx.onCleanup(() => redis.unsubscribe(`post:${id}`));

  return initial;
}
```

### 3. Client Decides: Single vs Streaming

```typescript
// Single value (await)
const post = await client.Post.get("123");
console.log(post.title); // One-time fetch

// Streaming (subscribe)
client.Post.get("123").subscribe((post) => {
  console.log(post.title); // Updates in real-time
});
```

### 4. Optimistic Updates by Default

```typescript
// UI updates immediately, rolls back on error
await client.Post.update({ id: "123", title: "New Title" });
```

---

## Schema Definition

### All Field Types

```typescript
import { createSchema, t } from '@lens/core';

const schema = createSchema({
  Example: {
    // Primitives
    id: t.id(),                    // string (required)
    name: t.string(),              // string
    age: t.int(),                  // number (integer)
    score: t.float(),              // number (float)
    active: t.boolean(),           // boolean

    // Date/Time
    createdAt: t.datetime(),       // Date (serialized to ISO string)
    birthDate: t.date(),           // Date (date only)

    // Large Numbers
    balance: t.decimal(),          // Decimal (serialized to string)
    bigValue: t.bigint(),          // BigInt (serialized to string)

    // Binary
    avatar: t.bytes(),             // Uint8Array (serialized to base64)

    // Optional fields
    bio: t.string().optional(),    // string | null

    // Arrays
    tags: t.array(t.string()),     // string[]
    scores: t.array(t.int()),      // number[]
    dates: t.array(t.datetime()),  // Date[]

    // JSON (untyped)
    metadata: t.json(),            // unknown

    // Relations
    posts: t.hasMany('Post'),      // Post[]
    author: t.belongsTo('User'),   // User
  },
});
```

### Custom Types

```typescript
import { defineType } from '@lens/core';

// Define custom type with serialization
const Email = defineType<string>({
  serialize: (value) => value.toLowerCase(),
  deserialize: (value) => value,
  validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
});

const schema = createSchema({
  User: {
    id: t.id(),
    email: Email,  // Use custom type
  },
});
```

### Relations

```typescript
const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    posts: t.hasMany('Post'),        // One-to-many
    profile: t.hasOne('Profile'),    // One-to-one
  },
  Post: {
    id: t.id(),
    title: t.string(),
    author: t.belongsTo('User'),     // Many-to-one
    tags: t.manyToMany('Tag'),       // Many-to-many
  },
  Profile: {
    id: t.id(),
    bio: t.string(),
    user: t.belongsTo('User'),
  },
  Tag: {
    id: t.id(),
    name: t.string(),
    posts: t.manyToMany('Post'),
  },
});
```

---

## Server Setup

### Basic Server

```typescript
import { createServer, createResolvers } from '@lens/server';
import { schema } from './schema';

const resolvers = createResolvers(schema, {
  User: {
    // Required: Single entity resolver
    resolve: async (id, ctx) => {
      return ctx.db.user.findUnique({ where: { id } });
    },

    // Optional: Batch resolver (N+1 optimization)
    batch: async (ids, ctx) => {
      const users = await ctx.db.user.findMany({
        where: { id: { in: ids } }
      });
      // Return in same order as ids
      return ids.map(id => users.find(u => u.id === id) || null);
    },

    // Optional: List resolver
    list: async (input, ctx) => {
      return ctx.db.user.findMany({
        where: input.where,
        orderBy: input.orderBy,
        take: input.take,
        skip: input.skip,
      });
    },

    // Optional: Paginated list
    listPaginated: async (input, ctx) => {
      const users = await ctx.db.user.findMany({ /* ... */ });
      return {
        data: users,
        pageInfo: {
          startCursor: users[0]?.id || null,
          endCursor: users[users.length - 1]?.id || null,
          hasNextPage: users.length === input.take,
          hasPreviousPage: !!input.cursor,
        },
      };
    },

    // Optional: Mutations
    create: async (input, ctx) => {
      return ctx.db.user.create({ data: input });
    },

    update: async (input, ctx) => {
      return ctx.db.user.update({
        where: { id: input.id },
        data: input
      });
    },

    delete: async (id, ctx) => {
      await ctx.db.user.delete({ where: { id } });
      return true;
    },
  },
});

const server = createServer({
  schema,
  resolvers,
  context: () => ({ db: prisma }),
});

server.listen(3000);
```

### With Express/Fastify

```typescript
import express from 'express';
import { createServer } from '@lens/server';

const app = express();
const lensServer = createServer({ schema, resolvers });

// HTTP endpoint
app.post('/api/lens', async (req, res) => {
  const result = await lensServer.handleHTTP(req.body);
  res.json(result);
});

// WebSocket endpoint
const httpServer = app.listen(3000);
lensServer.attachWebSocket(httpServer);
```

### Streaming Resolvers

```typescript
const resolvers = createResolvers(schema, {
  Message: {
    // LLM streaming response
    resolve: async function* (id, ctx) {
      const message = await ctx.db.message.findUnique({ where: { id } });

      if (message.complete) {
        yield message; // Already complete, yield once
        return;
      }

      // Stream from LLM
      const stream = await ctx.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: message.prompt }],
        stream: true,
      });

      let content = "";
      for await (const chunk of stream) {
        content += chunk.choices[0]?.delta?.content || "";
        yield { ...message, content }; // Yield updates
      }

      // Save final result
      await ctx.db.message.update({
        where: { id },
        data: { content, complete: true },
      });
    },
  },

  Stock: {
    // Real-time price updates via ctx.emit
    resolve: async (id, ctx) => {
      const stock = await ctx.db.stock.findUnique({ where: { id } });

      // Subscribe to price updates
      const ws = new WebSocket(`wss://prices.example.com/${stock.symbol}`);

      ws.on('message', (data) => {
        const price = JSON.parse(data).price;
        ctx.emit({ ...stock, price }); // Push to clients
      });

      ctx.onCleanup(() => ws.close());

      return stock;
    },
  },
});
```

### Context Management

```typescript
interface Context {
  db: PrismaClient;
  user: User | null;
  req: Request;
}

const server = createServer({
  schema,
  resolvers,
  context: async (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = token ? await verifyToken(token) : null;

    return {
      db: prisma,
      user,
      req,
    };
  },
});
```

---

## Client Usage

### Creating a Client

```typescript
import { createClient, httpLink, wsLink, splitLink } from '@lens/client';
import type { Schema } from './schema';

// Simple WebSocket client
const client = createClient<Schema>({
  url: 'ws://localhost:3000',
});

// With custom links (middleware)
const client = createClient<Schema>({
  links: [
    loggerLink(),                    // Log all operations
    retryLink({ attempts: 3 }),      // Auto-retry failed requests
    cacheLink(),                     // Cache responses
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ url: 'ws://localhost:3000' }),
      false: httpLink({ url: 'http://localhost:3000/api' }),
    }),
  ],
});
```

### Queries

```typescript
// Single entity
const user = await client.User.get("123");
console.log(user.name);

// With field selection
const user = await client.User.get("123", {
  select: { name: true, email: true },
});
// Type: { name: string; email: string } | null

// List entities
const posts = await client.Post.list({
  where: { published: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// Paginated list
const result = await client.Post.listPaginated({
  take: 20,
  cursor: { id: lastId },
});
console.log(result.data);        // Post[]
console.log(result.pageInfo);    // { hasNextPage, endCursor, ... }
```

### Mutations

```typescript
// Create
const newPost = await client.Post.create({
  title: "Hello World",
  content: "My first post!",
  published: true,
});

// Update (optimistic by default)
await client.Post.update({
  id: "123",
  title: "Updated Title",
});

// Delete
await client.Post.delete("123");
```

### Subscriptions

```typescript
// Subscribe to single entity
const unsubscribe = client.Post.get("123").subscribe({
  next: (post) => console.log('Updated:', post),
  error: (err) => console.error('Error:', err),
  complete: () => console.log('Subscription ended'),
});

// Subscribe to list
client.Post.list({ where: { published: true } }).subscribe((posts) => {
  console.log('Posts updated:', posts);
});

// Unsubscribe
unsubscribe();
```

### Reactive Queries

```typescript
// QueryResult is both Promise and Observable
const postQuery = client.Post.get("123");

// Use as Promise (single value)
const post = await postQuery;
console.log(post.title);

// Use as Observable (streaming)
postQuery.subscribe((post) => {
  console.log('Real-time:', post.title);
});

// Refetch
await postQuery.refetch();
```

---

## Links (Middleware)

Links are composable middleware for the client, similar to tRPC links.

### HTTP Link

```typescript
import { httpLink } from '@lens/client';

const client = createClient({
  links: [
    httpLink({
      url: 'http://localhost:3000/api',
      headers: async () => ({
        Authorization: `Bearer ${await getToken()}`,
      }),
    }),
  ],
});
```

### HTTP Batch Link

```typescript
import { httpBatchLink } from '@lens/client';

// Automatically batches multiple requests within 10ms
const client = createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api',
      maxBatchSize: 10,
      batchInterval: 10, // ms
    }),
  ],
});
```

### WebSocket Link

```typescript
import { websocketLink } from '@lens/client';

const client = createClient({
  links: [
    websocketLink({
      url: 'ws://localhost:3000',
      reconnect: true,
      reconnectAttempts: 5,
      reconnectInterval: 1000,
    }),
  ],
});
```

### SSE Link

```typescript
import { sseLink } from '@lens/client';

const client = createClient({
  links: [
    sseLink({
      url: 'http://localhost:3000/sse',
    }),
  ],
});
```

### Cache Link

```typescript
import { cacheLink, createCacheStore } from '@lens/client';

const cache = createCacheStore({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,       // Max 100 entries
  strategies: {
    Post: {
      ttl: 10 * 60 * 1000,      // Posts cached for 10 min
      invalidateOn: ['update'],  // Clear on update mutation
    },
  },
});

const client = createClient({
  links: [
    cacheLink({ store: cache }),
    httpLink({ url: '/api' }),
  ],
});
```

### Retry Link

```typescript
import { retryLink } from '@lens/client';

const client = createClient({
  links: [
    retryLink({
      attempts: 3,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      shouldRetry: (error) => {
        // Retry on network errors, not auth errors
        return error.code !== 'UNAUTHORIZED';
      },
    }),
    httpLink({ url: '/api' }),
  ],
});
```

### Logger Link

```typescript
import { loggerLink } from '@lens/client';

const client = createClient({
  links: [
    loggerLink({
      enabled: process.env.NODE_ENV === 'development',
      logger: {
        log: (message) => console.log('[Lens]', message),
        error: (message) => console.error('[Lens]', message),
      },
    }),
    httpLink({ url: '/api' }),
  ],
});
```

### Split Link

```typescript
import { splitLink, wsLink, httpLink } from '@lens/client';

// Use WebSocket for subscriptions, HTTP for queries/mutations
const client = createClient({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ url: 'ws://localhost:3000' }),
      false: httpLink({ url: 'http://localhost:3000/api' }),
    }),
  ],
});
```

### Compression Link

```typescript
import { compressionLink } from '@lens/client';

const client = createClient({
  links: [
    compressionLink({
      minSize: 1024,      // Only compress if > 1KB
      algorithm: 'gzip',  // 'gzip' | 'deflate' | 'br'
    }),
    httpLink({ url: '/api' }),
  ],
});
```

### MessagePack Link

```typescript
import { msgpackLink } from '@lens/client';

// Use MessagePack instead of JSON (20-50% smaller)
const client = createClient({
  links: [
    msgpackLink({ binaryMode: true }),
    httpLink({ url: '/api' }),
  ],
});
```

### Custom Link

```typescript
import type { Link } from '@lens/client';

const authLink: Link = () => {
  return async (operation, next) => {
    // Add auth token
    const token = await getAuthToken();
    const modifiedOp = {
      ...operation,
      meta: {
        ...operation.meta,
        headers: {
          ...operation.meta?.headers,
          Authorization: `Bearer ${token}`,
        },
      },
    };

    // Execute next link
    const result = await next(modifiedOp);

    // Handle result
    if (result.error?.code === 'UNAUTHORIZED') {
      await refreshToken();
      // Retry
      return next(modifiedOp);
    }

    return result;
  };
};

const client = createClient({
  links: [authLink, httpLink({ url: '/api' })],
});
```

---

## Reactive System

### Signals (Powered by @preact/signals)

```typescript
import { signal, computed, effect } from '@lens/client';

// Create signal
const count = signal(0);

// Read value
console.log(count.value); // 0

// Update value
count.value = 1;

// Computed signal
const doubled = computed(() => count.value * 2);
console.log(doubled.value); // 2

// Side effects
effect(() => {
  console.log('Count changed:', count.value);
});
```

### EntitySignal (Field-level Reactivity)

```typescript
import { createEntitySignal } from '@lens/client';

// Create entity signal
const postSignal = createEntitySignal({
  id: "123",
  title: "Hello",
  content: "World",
});

// Access fields as signals
console.log(postSignal.fields.title.value); // "Hello"

// Subscribe to specific fields
postSignal.fields.title.subscribe((title) => {
  console.log('Title changed:', title);
});

// Update single field
postSignal.setFields({ title: "New Title" });

// Get all data
console.log(postSignal.data); // { id, title, content }
```

### Reactive Client

For advanced use cases, use the reactive client directly:

```typescript
import { createReactiveClient } from '@lens/client';

const client = createReactiveClient<Schema>({
  queryTransport: /* ... */,
  subscriptionTransport: /* ... */,
});

// Get returns EntitySignal
const postSignal = client.Post.get("123");

// Subscribe to specific fields
postSignal.fields.title.subscribe((title) => {
  console.log('Title:', title);
});

// List returns ListSignal
const postsSignal = client.Post.list({ where: { published: true } });

postsSignal.subscribe((posts) => {
  console.log('Posts:', posts);
});

// Mutations return ReactiveMutationResult
const result = await client.Post.update({
  id: "123",
  title: "New Title",
});
```

---

## Framework Integration

### React

```tsx
import { useEntity, useList, useMutation } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  // Single entity
  const { data: user, loading, error } = useEntity('User', { id: userId });

  // List entities
  const { data: posts, loading: postsLoading } = useList('Post', {
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
  });

  // Mutations
  const { mutate: updateUser, loading: updating } = useMutation('User', 'update');
  const { mutate: createPost } = useMutation('Post', 'create');
  const { mutate: deletePost } = useMutation('Post', 'delete');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!user) return <div>User not found</div>;

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>

      <button
        onClick={() => updateUser({ id: userId, name: 'New Name' })}
        disabled={updating}
      >
        Update Name
      </button>

      <h2>Posts</h2>
      {postsLoading ? (
        <div>Loading posts...</div>
      ) : (
        <ul>
          {posts.map(post => (
            <li key={post.id}>
              {post.title}
              <button onClick={() => deletePost(post.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => createPost({
        title: 'New Post',
        content: 'Content here',
        published: true,
      })}>
        Create Post
      </button>
    </div>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useEntity, useList, useMutation } from '@lens/vue';

const props = defineProps<{ userId: string }>();

const { data: user, loading, error } = useEntity('User', { id: props.userId });
const { data: posts } = useList('Post', {
  where: { authorId: props.userId },
});
const { mutate: updateUser } = useMutation('User', 'update');
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else-if="user">
    <h1>{{ user.name }}</h1>
    <p>{{ user.email }}</p>

    <button @click="updateUser({ id: userId, name: 'New Name' })">
      Update Name
    </button>

    <h2>Posts</h2>
    <ul>
      <li v-for="post in posts" :key="post.id">
        {{ post.title }}
      </li>
    </ul>
  </div>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { useEntity, useList, useMutation } from '@lens/svelte';

  export let userId: string;

  const user = useEntity('User', { id: userId });
  const posts = useList('Post', { where: { authorId: userId } });
  const updateUser = useMutation('User', 'update');
</script>

{#if $user.loading}
  <div>Loading...</div>
{:else if $user.error}
  <div>Error: {$user.error.message}</div>
{:else if $user.data}
  <h1>{$user.data.name}</h1>
  <p>{$user.data.email}</p>

  <button on:click={() => $updateUser({ id: userId, name: 'New Name' })}>
    Update Name
  </button>

  <h2>Posts</h2>
  <ul>
    {#each $posts.data as post (post.id)}
      <li>{post.title}</li>
    {/each}
  </ul>
{/if}
```

---

## Advanced Features

### Optimistic Updates

```typescript
// Automatic optimistic updates
await client.Post.update({
  id: "123",
  title: "New Title",
});
// UI updates immediately, rolls back on error

// Manual optimistic updates
const optimisticId = client.optimistic.create('Post', {
  id: 'temp-123',
  title: 'Optimistic Post',
});

try {
  const result = await client.Post.create({
    title: 'Optimistic Post',
  });
  client.optimistic.commit(optimisticId, result);
} catch (error) {
  client.optimistic.rollback(optimisticId);
}
```

### Field Selection

```typescript
// Select specific fields
const user = await client.User.get("123", {
  select: { name: true, email: true },
});
// Type: { name: string; email: string } | null

// Nested selection
const user = await client.User.get("123", {
  select: {
    name: true,
    posts: {
      select: { title: true, createdAt: true },
    },
  },
});
// Type: { name: string; posts: { title: string; createdAt: Date }[] } | null
```

### Pagination

```typescript
// Cursor-based pagination
let cursor: string | undefined;
const allPosts: Post[] = [];

while (true) {
  const result = await client.Post.listPaginated({
    take: 20,
    cursor: cursor ? { id: cursor } : undefined,
  });

  allPosts.push(...result.data);

  if (!result.pageInfo.hasNextPage) break;
  cursor = result.pageInfo.endCursor;
}
```

### Batching (DataLoader)

```typescript
// These three requests are automatically batched
const [user1, user2, user3] = await Promise.all([
  client.User.get("1"),
  client.User.get("2"),
  client.User.get("3"),
]);
// Single batch request to server
```

### Error Handling

```typescript
try {
  await client.Post.update({ id: "123", title: "New" });
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    console.log('Post not found');
  } else if (error.code === 'UNAUTHORIZED') {
    console.log('Not authorized');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Complete Example

### Full-Stack Blog Application

**schema.ts**
```typescript
import { createSchema, t } from '@lens/core';

export const schema = createSchema({
  User: {
    id: t.id(),
    name: t.string(),
    email: t.string(),
    avatar: t.string().optional(),
    posts: t.hasMany('Post'),
    comments: t.hasMany('Comment'),
    createdAt: t.datetime(),
  },
  Post: {
    id: t.id(),
    title: t.string(),
    content: t.string(),
    published: t.boolean(),
    views: t.int(),
    author: t.belongsTo('User'),
    comments: t.hasMany('Comment'),
    tags: t.array(t.string()),
    createdAt: t.datetime(),
    updatedAt: t.datetime(),
  },
  Comment: {
    id: t.id(),
    content: t.string(),
    author: t.belongsTo('User'),
    post: t.belongsTo('Post'),
    createdAt: t.datetime(),
  },
});

export type Schema = typeof schema;
```

**server.ts**
```typescript
import { createServer, createResolvers } from '@lens/server';
import { PrismaClient } from '@prisma/client';
import { schema } from './schema';

const prisma = new PrismaClient();

const resolvers = createResolvers(schema, {
  User: {
    resolve: (id) => prisma.user.findUnique({ where: { id } }),
    batch: (ids) => prisma.user.findMany({ where: { id: { in: ids } } })
      .then(users => ids.map(id => users.find(u => u.id === id) || null)),
    create: (input) => prisma.user.create({ data: input }),
    update: (input) => prisma.user.update({
      where: { id: input.id },
      data: input
    }),
    delete: (id) => prisma.user.delete({ where: { id } }).then(() => true),
  },
  Post: {
    resolve: async (id, ctx) => {
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) return null;

      // Increment view count
      await prisma.post.update({
        where: { id },
        data: { views: { increment: 1 } },
      });

      return { ...post, views: post.views + 1 };
    },
    batch: (ids) => prisma.post.findMany({ where: { id: { in: ids } } })
      .then(posts => ids.map(id => posts.find(p => p.id === id) || null)),
    list: (input) => prisma.post.findMany({
      where: input.where,
      orderBy: input.orderBy,
      take: input.take,
      skip: input.skip,
    }),
    create: (input) => prisma.post.create({ data: input }),
    update: (input) => prisma.post.update({
      where: { id: input.id },
      data: { ...input, updatedAt: new Date() }
    }),
    delete: (id) => prisma.post.delete({ where: { id } }).then(() => true),
  },
  Comment: {
    resolve: (id) => prisma.comment.findUnique({ where: { id } }),
    batch: (ids) => prisma.comment.findMany({ where: { id: { in: ids } } })
      .then(comments => ids.map(id => comments.find(c => c.id === id) || null)),
    list: (input) => prisma.comment.findMany({
      where: input.where,
      orderBy: input.orderBy,
    }),
    create: (input) => prisma.comment.create({ data: input }),
    delete: (id) => prisma.comment.delete({ where: { id } }).then(() => true),
  },
});

const server = createServer({
  schema,
  resolvers,
  context: () => ({ db: prisma }),
});

server.listen(3000);
console.log('Server running on ws://localhost:3000');
```

**client.ts**
```typescript
import {
  createClient,
  loggerLink,
  retryLink,
  cacheLink,
  httpBatchLink
} from '@lens/client';
import type { Schema } from './schema';

export const client = createClient<Schema>({
  links: [
    loggerLink({ enabled: process.env.NODE_ENV === 'development' }),
    retryLink({ attempts: 3 }),
    cacheLink(),
    httpBatchLink({ url: 'http://localhost:3000/api' }),
  ],
});
```

**App.tsx**
```tsx
import { useEntity, useList, useMutation } from '@lens/react';
import { client } from './client';

function BlogPost({ postId }: { postId: string }) {
  const { data: post, loading } = useEntity('Post', { id: postId });
  const { data: comments } = useList('Comment', {
    where: { postId },
    orderBy: { createdAt: 'desc' },
  });
  const { mutate: createComment } = useMutation('Comment', 'create');
  const { mutate: deletePost } = useMutation('Post', 'delete');

  const [newComment, setNewComment] = React.useState('');

  if (loading) return <div>Loading...</div>;
  if (!post) return <div>Post not found</div>;

  const handleSubmitComment = async () => {
    await createComment({
      content: newComment,
      postId: post.id,
      authorId: getCurrentUserId(),
    });
    setNewComment('');
  };

  return (
    <article>
      <h1>{post.title}</h1>
      <p>By {post.author?.name} • {post.views} views</p>
      <div>{post.content}</div>

      <div>
        {post.tags.map(tag => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>

      <button onClick={() => deletePost(post.id)}>Delete Post</button>

      <h2>Comments ({comments?.length || 0})</h2>
      <ul>
        {comments?.map(comment => (
          <li key={comment.id}>
            <strong>{comment.author?.name}</strong>: {comment.content}
          </li>
        ))}
      </ul>

      <div>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
        />
        <button onClick={handleSubmitComment}>Submit</button>
      </div>
    </article>
  );
}
```

---

## API Reference

### Schema API

- `createSchema(definition)` - Create schema from entity definitions
- `t.id()` - ID field (string)
- `t.string()` - String field
- `t.int()` - Integer field
- `t.float()` - Float field
- `t.boolean()` - Boolean field
- `t.datetime()` - Date/time field
- `t.date()` - Date field
- `t.decimal()` - Decimal number
- `t.bigint()` - Big integer
- `t.bytes()` - Binary data
- `t.json()` - JSON field
- `t.array(type)` - Array field
- `t.hasMany(entity)` - One-to-many relation
- `t.hasOne(entity)` - One-to-one relation
- `t.belongsTo(entity)` - Many-to-one relation
- `t.manyToMany(entity)` - Many-to-many relation
- `.optional()` - Mark field as optional
- `defineType(config)` - Define custom type

### Server API

- `createResolvers(schema, resolvers)` - Create resolver definitions
- `createServer(config)` - Create Lens server
- `server.listen(port)` - Start server
- `server.handleHTTP(request)` - Handle HTTP request
- `server.attachWebSocket(server)` - Attach WebSocket handler

**Resolver methods:**
- `resolve(id, ctx)` - Get single entity
- `batch(ids, ctx)` - Get multiple entities (batched)
- `list(input, ctx)` - Get list of entities
- `listPaginated(input, ctx)` - Get paginated list
- `create(input, ctx)` - Create entity
- `update(input, ctx)` - Update entity
- `delete(id, ctx)` - Delete entity

**Context methods:**
- `ctx.emit(data)` - Emit update to subscribed clients
- `ctx.onCleanup(fn)` - Register cleanup function

### Client API

- `createClient(config)` - Create Lens client
- `client.Entity.get(id, options?)` - Get single entity
- `client.Entity.list(options?)` - Get list of entities
- `client.Entity.listPaginated(options?)` - Get paginated list
- `client.Entity.create(input)` - Create entity
- `client.Entity.update(input)` - Update entity
- `client.Entity.delete(id)` - Delete entity

**QueryResult methods:**
- `await result` - Get value as Promise
- `result.subscribe(observer)` - Subscribe to updates
- `result.refetch()` - Refetch data

### Links API

- `httpLink(options)` - HTTP transport
- `httpBatchLink(options)` - Batched HTTP transport
- `websocketLink(options)` - WebSocket transport
- `sseLink(options)` - Server-Sent Events transport
- `cacheLink(options)` - Response caching
- `retryLink(options)` - Auto-retry failed requests
- `loggerLink(options)` - Request/response logging
- `splitLink(options)` - Conditional routing
- `compressionLink(options)` - Compress payloads
- `msgpackLink(options)` - MessagePack serialization
- `composeLinks(links)` - Compose multiple links

### React Hooks

- `useEntity(entity, options)` - Get single entity
- `useList(entity, options)` - Get list of entities
- `useMutation(entity, operation)` - Execute mutation

### Reactive API

- `createReactiveClient(config)` - Create reactive client
- `createEntitySignal(data)` - Create entity signal
- `createSubscriptionManager()` - Create subscription manager

**Signal API:**
- `signal(value)` - Create signal
- `computed(fn)` - Create computed signal
- `effect(fn)` - Run side effect
- `batch(fn)` - Batch updates
- `signal.value` - Get/set value
- `signal.subscribe(fn)` - Subscribe to changes

---

## Best Practices

### 1. Use Batch Resolvers

Always implement batch resolvers to avoid N+1 queries:

```typescript
const resolvers = createResolvers(schema, {
  User: {
    resolve: (id) => db.user.findUnique({ where: { id } }),
    batch: (ids) => db.user.findMany({ where: { id: { in: ids } } })
      .then(users => ids.map(id => users.find(u => u.id === id) || null)),
  },
});
```

### 2. Field Selection for Large Objects

Use field selection to reduce payload size:

```typescript
// ❌ Don't fetch everything
const user = await client.User.get(id);

// ✅ Select only needed fields
const user = await client.User.get(id, {
  select: { name: true, avatar: true },
});
```

### 3. Cache Frequently Accessed Data

```typescript
const client = createClient({
  links: [
    cacheLink({
      strategies: {
        User: { ttl: 5 * 60 * 1000 }, // 5 min cache
        Post: { ttl: 1 * 60 * 1000 }, // 1 min cache
      },
    }),
    httpLink({ url: '/api' }),
  ],
});
```

### 4. Error Handling in Resolvers

```typescript
const resolvers = createResolvers(schema, {
  User: {
    resolve: async (id, ctx) => {
      try {
        return await ctx.db.user.findUnique({ where: { id } });
      } catch (error) {
        console.error('Failed to fetch user:', error);
        throw new Error('User not found');
      }
    },
  },
});
```

### 5. Cleanup in Streaming Resolvers

```typescript
const resolvers = createResolvers(schema, {
  Stock: {
    resolve: async (id, ctx) => {
      const ws = new WebSocket(`wss://prices/${id}`);

      ws.on('message', (data) => ctx.emit(data));

      // Always cleanup!
      ctx.onCleanup(() => {
        ws.close();
        console.log(`Cleaned up WebSocket for ${id}`);
      });

      return getInitialData(id);
    },
  },
});
```

---

## Performance Tips

1. **Enable HTTP Batching** - Reduces round trips
2. **Implement Batch Resolvers** - Prevents N+1 queries
3. **Use Field Selection** - Reduces payload size
4. **Enable Caching** - Reduces server load
5. **Use MessagePack** - 20-50% smaller than JSON
6. **Enable Compression** - Further reduce bandwidth
7. **Cursor-based Pagination** - Faster than offset pagination

---

## Troubleshooting

### Client can't connect to server

```typescript
// Check your URL
const client = createClient<Schema>({
  url: 'ws://localhost:3000', // WebSocket
  // or
  url: 'http://localhost:3000/api', // HTTP
});
```

### Type errors on client

Make sure you're importing the schema type correctly:

```typescript
import type { Schema } from './schema'; // type import!

const client = createClient<Schema>({ /* ... */ });
```

### Optimistic updates not working

Ensure your mutations return the updated entity:

```typescript
update: async (input, ctx) => {
  const result = await ctx.db.post.update({
    where: { id: input.id },
    data: input,
  });
  return result; // Must return updated entity!
},
```

---

## Documentation

- **[Architecture](./ARCHITECTURE.md)** - Design philosophy and unified model
- **[API Reference](./docs/API.md)** - Complete API documentation
- **[Examples](./examples/)** - Code examples

---

## Packages

| Package | Description | Size |
|---------|-------------|------|
| `@lens/core` | Schema, types, utilities (zero deps) | ~15KB |
| `@lens/server` | Resolvers, execution engine | ~25KB |
| `@lens/client` | Client API, links, signals | ~35KB |
| `@lens/react` | React hooks | ~5KB |
| `@lens/vue` | Vue composables | ~5KB |
| `@lens/svelte` | Svelte stores | ~5KB |

---

## Status

✅ **Production Ready**

- 182 tests passing (core + server + client)
- Full TypeScript support
- Zero breaking changes planned

---

## Contributing

Contributions welcome! Please read our [Contributing Guide](./CONTRIBUTING.md).

---

## License

MIT © Sylphx AI

---

## Why "Lens"?

A lens focuses light to create a clear image. Similarly, Lens focuses your data layer to create a clear, type-safe, reactive API. It's the lens through which your frontend views your backend data.
