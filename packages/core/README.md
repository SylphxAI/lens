# @sylphx/lens-core

Core schema types and utilities for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-core
```

## Usage

### Entity Definition (Function-based API)

```typescript
import { entity, lens, router } from "@sylphx/lens-core";
import { z } from "zod";

interface AppContext {
  db: Database;
  user: User | null;
}

// Define entities with inline resolvers
const User = entity<AppContext>("User").define((t) => ({
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

const Post = entity<AppContext>("Post").define((t) => ({
  id: t.id(),
  title: t.string(),
  content: t.string(),
  authorId: t.string(),
  author: t.one(() => User).resolve(({ parent, ctx }) =>
    ctx.db.users.get(parent.authorId)!
  ),
}));
```

### Operations

```typescript
// Create typed builders
const { query, mutation, plugins } = lens<AppContext>();

// Query
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!);

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

### Entity Definition

| Pattern | Example |
|---------|---------|
| Basic | `entity("Name", (t) => ({ ... }))` |
| Typed Context | `entity<Ctx>("Name").define((t) => ({ ... }))` |

### Type Builder (`t`)

| Method | Description |
|--------|-------------|
| `t.id()` | ID field |
| `t.string()` | String field |
| `t.int()` | Integer field |
| `t.boolean()` | Boolean field |
| `t.date()` | Date field |
| `t.enum([...])` | Enum field |
| `t.one(() => E)` | Singular relation |
| `t.many(() => E)` | Collection relation |
| `.resolve(fn)` | Field resolver |
| `.subscribe(fn)` | Live updates (Publisher pattern) |

### Operations

| Pattern | Description |
|---------|-------------|
| `.resolve()` | One-shot query/mutation |
| `.resolve().subscribe()` | Live query (initial + updates) |
| `.optimistic("merge")` | Simple optimistic update |
| `.optimistic(({ input }) => [...])` | Reify DSL optimistic |

## License

MIT

---

Built with [@sylphx/reify](https://github.com/SylphxAI/reify) and [@sylphx/standard-entity](https://github.com/SylphxAI/standard-entity).

Powered by Sylphx
