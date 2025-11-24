# Lens API Reference

Complete API documentation for Lens.

---

## Table of Contents

1. [Schema (`@lens/core`)](#schema-lenscore)
2. [Server (`@lens/server`)](#server-lensserver)
3. [Client (`@lens/client`)](#client-lensclient)
4. [React (`@lens/react`)](#react-lensreact)

---

## Schema (`@lens/core`)

### `createSchema(definition)`

Creates a typed schema from entity definitions.

```typescript
import { createSchema, t } from '@lens/core';

const schema = createSchema({
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
```

### Type Builders (`t.*`)

#### Scalar Types

| Builder | Type | Description |
|---------|------|-------------|
| `t.id()` | `string` | Primary key (UUID, CUID, etc.) |
| `t.string()` | `string` | Text field |
| `t.int()` | `number` | Integer |
| `t.float()` | `number` | Floating point |
| `t.boolean()` | `boolean` | Boolean |
| `t.datetime()` | `Date` | Date/time |
| `t.enum(values)` | Union | Enum type |
| `t.object<T>()` | `T` | Typed object |
| `t.array(type)` | `T[]` | Array of type |

#### Modifiers

```typescript
t.string()              // Required string
t.string().nullable()   // string | null
t.string().default('') // With default value
t.int().default(0)     // With default value
```

#### Relations

| Builder | Cardinality | Description |
|---------|-------------|-------------|
| `t.hasOne(target)` | 1:1 | One-to-one (owns) |
| `t.hasMany(target)` | 1:N | One-to-many |
| `t.belongsTo(target)` | N:1 | Many-to-one (foreign key) |

```typescript
User: {
  profile: t.hasOne('Profile'),     // User owns Profile
  posts: t.hasMany('Post'),         // User has many Posts
},
Post: {
  author: t.belongsTo('User'),      // Post belongs to User
},
```

### Type Inference

```typescript
// Infer entity type
type User = InferEntity<typeof schema.User>;
// { id: string; name: string; email: string; posts: Post[] }

// Infer with selection
type Selected = InferSelected<User, { id: true; name: true }>;
// { id: string; name: string }
```

---

## Server (`@lens/server`)

### `createResolvers(schema, resolvers)`

Creates resolvers for a schema.

```typescript
import { createResolvers } from '@lens/server';

const resolvers = createResolvers(schema, {
  User: {
    // Required: single entity resolver
    resolve: async (id, ctx) => {
      return await ctx.db.user.findUnique({ where: { id } });
    },

    // Optional: batch resolver (for N+1 elimination)
    batch: async (ids, ctx) => {
      return await ctx.db.user.findMany({ where: { id: { in: ids } } });
    },

    // Optional: relation resolvers
    posts: async (user, ctx) => {
      return await ctx.db.post.findMany({ where: { authorId: user.id } });
    },
  },
});
```

### Resolver Patterns

Lens supports three patterns for emitting data. All feed into the same reactive pipeline.

#### 1. return (Static)

Simplest pattern - returns once, subscription receives one value.

```typescript
resolve: async (id, ctx) => {
  return await ctx.db.user.findUnique({ where: { id } });
}
```

#### 2. yield (Streaming)

Generator pattern - yields multiple values in sequence.

```typescript
resolve: async function* (id, ctx) {
  // Initial value
  const post = await ctx.db.post.findUnique({ where: { id } });
  yield post;

  // Stream updates (e.g., LLM streaming)
  for await (const chunk of ctx.llm.stream(post.promptId)) {
    yield { ...post, content: post.content + chunk };
  }
}
```

#### 3. emit (Flexible)

Most flexible - can emit from anywhere (callbacks, events, etc.)

```typescript
resolve: async (id, ctx) => {
  // Initial
  ctx.emit(await ctx.db.post.findUnique({ where: { id } }));

  // Event-driven updates
  ctx.db.watch('Post', id, (change) => {
    ctx.emit(change);  // Partial or full update
  });

  // Cleanup when subscription ends
  ctx.onCleanup(() => ctx.db.unwatch('Post', id));
}
```

#### Mixed Pattern

Can combine yield and emit:

```typescript
resolve: async function* (id, ctx) {
  yield await ctx.db.get(id);  // Initial via yield

  // Then emit from events
  ctx.onCleanup(
    redis.subscribe(`entity:${id}`, (msg) => ctx.emit(msg))
  );
}
```

#### Emit Behavior

```typescript
// Partial update - merges into existing state
ctx.emit({ title: "New Title" });

// Full update - replaces state
ctx.emit({ id, title, content, author, createdAt });
```

#### Batch Resolver

```typescript
// Called with multiple IDs, returns array
batch: async (ids, ctx) => {
  const results = await ctx.db.user.findMany({
    where: { id: { in: ids } }
  });
  // Must return in same order as ids
  return ids.map(id => results.find(r => r.id === id));
}
```

### Context

```typescript
interface Context {
  db: Database;           // Your database client
  user?: AuthenticatedUser; // Auth info
  // ... custom context
}

// Pass context when creating server
const server = createServer({
  schema,
  resolvers,
  context: (req) => ({
    db: prisma,
    user: req.user,
  }),
});
```

### `createServer(options)`

Creates the Lens server.

```typescript
import { createServer } from '@lens/server';

const server = createServer({
  schema,
  resolvers,
  context: (req) => ({ ... }),
});

// WebSocket
server.listen(3000);

// Or with existing HTTP server
server.attach(httpServer);

// Or get handlers for framework integration
const { handleUpgrade, handleRequest } = server.handlers();
```

---

## Client (`@lens/client`)

### `createClient(config)`

Creates a typed client from schema.

```typescript
import { createClient } from '@lens/client';
import type { schema } from './schema';

const api = createClient<typeof schema>({
  url: 'ws://localhost:3000',
  // Or separate URLs
  wsUrl: 'ws://localhost:3000',
  httpUrl: 'http://localhost:3000',
});
```

### Entity Operations

#### `api.[entity].get(input, options?)`

Get single entity. Returns reactive signal.

```typescript
// Get user
const user = api.user.get({ id: '123' });
// user: Signal<User | null>

// Access value
console.log(user.value);

// Subscribe to changes
user.subscribe((value) => {
  console.log('User updated:', value);
});
```

#### `api.[entity].list(input?, options?)`

Get list of entities. Returns reactive signal.

```typescript
// List all users
const users = api.user.list();
// users: Signal<User[]>

// With filters
const activeUsers = api.user.list({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
```

#### `api.[entity].create(input)`

Create entity. Returns promise, triggers optimistic update.

```typescript
const newPost = await api.post.create({
  title: 'Hello World',
  content: 'My first post',
});
// UI updates immediately (optimistic)
// newPost contains server response with real ID
```

#### `api.[entity].update(input)`

Update entity. Returns promise, triggers optimistic update.

```typescript
await api.post.update({
  id: '123',
  title: 'Updated Title',
});
// UI updates immediately
// Rolls back on error
```

#### `api.[entity].delete(input)`

Delete entity. Returns promise, triggers optimistic update.

```typescript
await api.post.delete({ id: '123' });
// Removed from UI immediately
// Restored on error
```

### Field Selection

```typescript
// Select specific fields
const user = api.user.get({ id: '123' }, {
  select: {
    id: true,
    name: true,
    posts: {
      select: {
        id: true,
        title: true,
      },
      take: 5,
    },
  },
});

// Type is narrowed:
// Signal<{
//   id: string;
//   name: string;
//   posts: { id: string; title: string }[];
// } | null>
```

### Computed Values

```typescript
import { computed } from '@lens/client';

const user = api.user.get({ id: '123' });

// Derived signal
const postCount = computed(() => user.value?.posts.length ?? 0);
// postCount: Signal<number>

// Filtered posts
const publishedPosts = computed(() =>
  user.value?.posts.filter(p => p.status === 'published') ?? []
);
```

---

## React (`@lens/react`)

### `LensProvider`

Provides client context to React tree.

```tsx
import { LensProvider } from '@lens/react';

function App() {
  return (
    <LensProvider client={api}>
      <YourApp />
    </LensProvider>
  );
}
```

### `useEntity(accessor, input, options?)`

Use entity signal in React component.

```tsx
import { useEntity } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  const user = useEntity(api.user, { id: userId });

  if (!user.value) return <Loading />;

  return <h1>{user.value.name}</h1>;
}
```

### `useList(accessor, input?, options?)`

Use list signal in React component.

```tsx
import { useList } from '@lens/react';

function PostList() {
  const posts = useList(api.post, {
    where: { status: 'published' },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <ul>
      {posts.value.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### `useMutation(mutator)`

Use mutation with optimistic updates.

```tsx
import { useMutation } from '@lens/react';

function EditPost({ postId }: { postId: string }) {
  const updatePost = useMutation(api.post.update);

  const handleSave = async (title: string) => {
    await updatePost.mutate({ id: postId, title });
    // UI already updated (optimistic)
  };

  return (
    <button
      onClick={() => handleSave('New Title')}
      disabled={updatePost.isPending}
    >
      Save
    </button>
  );
}
```

### `useComputed(fn)`

Use computed value in React.

```tsx
import { useComputed } from '@lens/react';

function PostStats({ userId }: { userId: string }) {
  const user = useEntity(api.user, { id: userId });

  const postCount = useComputed(() => user.value?.posts.length ?? 0);
  const publishedCount = useComputed(() =>
    user.value?.posts.filter(p => p.status === 'published').length ?? 0
  );

  return (
    <div>
      <p>Total: {postCount}</p>
      <p>Published: {publishedCount}</p>
    </div>
  );
}
```

### Suspense Support

```tsx
import { useEntitySuspense } from '@lens/react';

function UserProfile({ userId }: { userId: string }) {
  // Throws promise while loading (for Suspense)
  const user = useEntitySuspense(api.user, { id: userId });

  return <h1>{user.name}</h1>;
}

// Usage
<Suspense fallback={<Loading />}>
  <UserProfile userId="123" />
</Suspense>
```

---

## Wire Protocol

### Message Types

#### Client → Server

```typescript
// Subscribe to entity
{
  type: 'subscribe',
  id: 'sub-1',
  entity: 'User',
  entityId: '123',
  select: { id: true, name: true },
}

// Unsubscribe
{
  type: 'unsubscribe',
  id: 'sub-1',
}

// Mutation
{
  type: 'mutate',
  id: 'mut-1',
  entity: 'User',
  operation: 'update',
  input: { id: '123', name: 'New Name' },
}
```

#### Server → Client

```typescript
// Initial data
{
  type: 'data',
  subscriptionId: 'sub-1',
  data: { id: '123', name: 'John' },
}

// Value update
{
  type: 'update',
  subscriptionId: 'sub-1',
  field: 'name',
  strategy: 'value',
  data: 'Jane',
}

// Delta update (streaming text)
{
  type: 'update',
  subscriptionId: 'sub-1',
  field: 'content',
  strategy: 'delta',
  data: { position: 100, insert: 'Hello' },
}

// Patch update (object/array)
{
  type: 'update',
  subscriptionId: 'sub-1',
  field: 'metadata',
  strategy: 'patch',
  data: [{ op: 'replace', path: '/views', value: 100 }],
}

// Mutation result
{
  type: 'result',
  mutationId: 'mut-1',
  data: { id: '123', name: 'New Name' },
}

// Error
{
  type: 'error',
  id: 'sub-1',
  error: { code: 'NOT_FOUND', message: 'Entity not found' },
}
```

---

## Update Strategies

### Value Strategy

Full value replacement. Used for:
- Short strings (< 100 chars)
- Numbers, booleans, enums
- Complete updates

```typescript
{ strategy: 'value', data: 'New Title' }
```

### Delta Strategy

Character-level diff. Used for:
- Long strings with small changes
- Streaming text (LLM responses)

```typescript
{
  strategy: 'delta',
  data: {
    position: 10,   // Start position
    delete: 5,      // Characters to delete
    insert: 'Hello' // Text to insert
  }
}
```

### Patch Strategy

JSON Patch (RFC 6902). Used for:
- Objects
- Arrays

```typescript
{
  strategy: 'patch',
  data: [
    { op: 'replace', path: '/name', value: 'John' },
    { op: 'add', path: '/tags/-', value: 'new-tag' },
    { op: 'remove', path: '/metadata/old' },
  ]
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Entity not found |
| `UNAUTHORIZED` | Not authenticated |
| `FORBIDDEN` | Not authorized |
| `VALIDATION_ERROR` | Input validation failed |
| `INTERNAL_ERROR` | Server error |
| `CONNECTION_ERROR` | Connection lost |

---

## TypeScript Types

### Core Types

```typescript
// Schema type
type Schema<T> = { ... };

// Entity inference
type InferEntity<T> = { ... };

// Selection
type Select<T> = {
  [K in keyof T]?: true | Select<T[K]>;
};

// Selected type
type InferSelected<T, S> = { ... };
```

### Client Types

```typescript
// Signal
interface Signal<T> {
  readonly value: T;
  subscribe(fn: (value: T) => void): () => void;
}

// Client
type Client<S extends Schema> = {
  [E in keyof S]: EntityAccessor<S[E]>;
};
```

### Server Types

```typescript
// Resolver
type Resolver<T> =
  | ((id: string, ctx: Context) => Promise<T>)
  | ((id: string, ctx: Context) => AsyncIterable<T>);

// Batch resolver
type BatchResolver<T> = (ids: string[], ctx: Context) => Promise<T[]>;
```
