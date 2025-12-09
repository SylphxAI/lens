# @sylphx/lens-core

Core schema types and utilities for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-core
```

## Usage

### Model Definition (New API)

```typescript
import { model, lens, router, list, nullable } from "@sylphx/lens-core";
import { z } from "zod";

interface AppContext {
  db: Database;
  user: User | null;
}

// Define models with inline resolvers
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  // Computed field
  displayName: t.string().resolve(({ parent }) =>
    `${parent.name} <${parent.email}>`
  ),
  // Relation with lazy reference (avoids circular deps)
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),
  // Live field (real-time updates)
  status: t.string()
    .resolve(({ parent, ctx }) => ctx.getStatus(parent.id))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, emit);
      onCleanup(unsub);
    }),
}));

const Post = model<AppContext>("Post", (t) => ({
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
  author: t.one(() => User).resolve(({ parent, ctx }) =>
    ctx.db.users.get(parent.authorId)!
  ),
}));

// Pure type model (no id) - still has resolvers
const Stats = model<AppContext>("Stats", (t) => ({
  totalUsers: t.int().resolve(({ ctx }) => ctx.db.users.count()),
  averageAge: t.float().resolve(({ ctx }) => ctx.db.users.averageAge()),
}));
```

### Operations

```typescript
// Create typed builders
const { query, mutation } = lens<AppContext>();

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
import { lens } from "@sylphx/lens-core";
import { optimisticPlugin } from "@sylphx/lens-server";
import { entity as e, temp, ref, now } from "@sylphx/reify";

const { mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

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
| Basic | `model("Name", (t) => ({ ... }))` |
| Typed Context | `model<Ctx>("Name", (t) => ({ ... }))` |
| Inline | `.returns(model("Result", (t) => ({ ... })))` |

### Return Type Wrappers

| Pattern | Example | Result Type |
|---------|---------|-------------|
| Model | `.returns(User)` | `User` |
| Nullable | `.returns(nullable(User))` | `User \| null` |
| List | `.returns(list(User))` | `User[]` |
| Nullable List | `.returns(nullable(list(User)))` | `User[] \| null` |

### Type Builder (`t`)

| Method | Description |
|--------|-------------|
| `t.id()` | ID field (makes model normalizable) |
| `t.string()` | String field |
| `t.int()` | Integer field |
| `t.float()` | Float field |
| `t.boolean()` | Boolean field |
| `t.date()` | Date field |
| `t.enum([...])` | Enum field |
| `t.one(() => E)` | Singular relation |
| `t.many(() => E)` | Collection relation |
| `.optional()` | Make field optional |
| `.args(schema)` | Add field arguments |
| `.resolve(fn)` | Field resolver |
| `.subscribe(fn)` | Live updates (Publisher pattern) |

### Operations

| Pattern | Description |
|---------|-------------|
| `.resolve()` | One-shot query/mutation |
| `.resolve().subscribe()` | Live query (initial + updates) |
| `.optimistic("merge")` | Simple optimistic update |
| `.optimistic(({ input }) => [...])` | Reify DSL optimistic |

## Migration from entity()

```typescript
// Old (deprecated)
const User = entity<AppContext>("User").define((t) => ({ ... }));

// New
const User = model<AppContext>("User", (t) => ({ ... }));
```

## License

MIT

---

Built with [@sylphx/reify](https://github.com/SylphxAI/reify) and [@sylphx/standard-entity](https://github.com/SylphxAI/standard-entity).

Powered by Sylphx
