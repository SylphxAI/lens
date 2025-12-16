# @sylphx/lens-core

Core schema types and utilities for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-core
```

## Usage

### Model Definition (New API)

```typescript
import { lens, id, string, int, float, list, nullable, router } from "@sylphx/lens-core";
import { z } from "zod";

interface AppContext {
  db: Database;
  user: User | null;
}

const { model, query, mutation } = lens<AppContext>();

// Define models with inline resolvers
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
  // Computed field
  displayName: string(),
  // Relation with lazy reference (avoids circular deps)
  posts: list(() => Post),
  // Live field (real-time updates)
  status: string(),
}).resolve({
  displayName: ({ source }) =>
    `${source.name} <${source.email}>`,
  posts: ({ source, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === source.id),
  status: {
    resolve: ({ source, ctx }) => ctx.getStatus(source.id),
    subscribe: ({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${source.id}`, emit);
      onCleanup(unsub);
    },
  },
});

const Post = model("Post", {
  id: id(),
  title: string(),
  content: string(),
  authorId: string(),
  author: () => User,
}).resolve({
  author: ({ source, ctx }) =>
    ctx.db.users.get(source.authorId)!
});

// Pure type model (no id) - still has resolvers
const Stats = model("Stats", {
  totalUsers: int(),
  averageAge: float(),
}).resolve({
  totalUsers: ({ ctx }) => ctx.db.users.count(),
  averageAge: ({ ctx }) => ctx.db.users.averageAge(),
});
```

### Operations

```typescript
// query and mutation come from lens<AppContext>()
// already imported above

// Query with model return type
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!);

// Query with nullable return
const findUser = query()
  .input(z.object({ email: z.string() }))
  .returns(nullable(User))  // User | null
  .resolve(({ input, ctx }) => ctx.db.users.findByEmail(input.email));

// Query with list return
const listUsers = query()
  .returns(list(User))  // User[]
  .resolve(({ ctx }) => ctx.db.users.findMany());

// Live Query (initial + updates)
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!)
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.db.users.onChange(input.id, emit);
    onCleanup(unsub);
  });

// Mutation
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.users.update(input));

// Router
const appRouter = router({
  user: {
    get: getUser,
    find: findUser,
    list: listUsers,
    watch: watchUser,
    update: updateUser,
  },
});
```

### With Optimistic Updates

```typescript
import { lens, id, string } from "@sylphx/lens-core";
import { optimisticPlugin } from "@sylphx/lens-server";
import { entity as e, temp, ref, now } from "@sylphx/reify";

const { model, mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

const Message = model("Message", {
  id: id(),
  content: string(),
  createdAt: string(),
});

// Sugar syntax
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic("merge")  // Instant UI update
  .resolve(({ input, ctx }) => ctx.db.users.update(input));

// Reify DSL (multi-entity)
const sendMessage = mutation()
  .input(z.object({ sessionId: z.string().optional(), content: z.string() }))
  .returns(Message)
  .optimistic(({ input }) => [
    e.create(Message, { id: temp(), content: input.content, createdAt: now() }),
  ])
  .resolve(({ input, ctx }) => ctx.db.messages.create(input));
```

## API Summary

### Model Definition

| Pattern | Example |
|---------|---------|
| Basic | `model("Name", { ... })` |
| Get from lens | `const { model } = lens<Ctx>()` |
| With resolvers | `model("Name", { ... }).resolve({ ... })` |

### Return Type Wrappers

| Pattern | Example | Result Type |
|---------|---------|-------------|
| Model | `.returns(User)` | `User` |
| Nullable | `.returns(nullable(User))` | `User \| null` |
| List | `.returns(list(User))` | `User[]` |
| Nullable List | `.returns(nullable(list(User)))` | `User[] \| null` |

### Field Builders

| Function | Description |
|----------|-------------|
| `id()` | ID field (makes model normalizable) |
| `string()` | String field |
| `int()` | Integer field |
| `float()` | Float field |
| `boolean()` | Boolean field |
| `date()` | Date field |
| `list(() => E)` | Collection relation |
| `() => E` | Singular relation (lazy) |
| `nullable(T)` | Make field nullable |
| `.resolve({ field: fn })` | Field resolvers |
| Field with subscribe | `{ resolve: fn, subscribe: fn }` for live updates |

### Operations

| Pattern | Description |
|---------|-------------|
| `.resolve()` | One-shot query/mutation |
| `.resolve().subscribe()` | Live query (initial + updates) |
| `.optimistic("merge")` | Simple optimistic update |
| `.optimistic(({ input }) => [...])` | Reify DSL optimistic |

## Migration Guide

```typescript
// Old API (deprecated)
import { model } from "@sylphx/lens-core"
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post),
}));

// New API
import { lens, id, string, list } from "@sylphx/lens-core"
const { model } = lens<AppContext>()
const User = model("User", {
  id: id(),
  name: string(),
  posts: list(() => Post),
}).resolve({
  posts: ({ source, ctx }) => ctx.db.posts.filter(p => p.authorId === source.id)
});
```

## License

MIT

---

Built with [@sylphx/reify](https://github.com/SylphxAI/reify) and [@sylphx/standard-entity](https://github.com/SylphxAI/standard-entity).

Powered by Sylphx
