# @sylphx/lens-core

Core schema types and utilities for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-core
```

## Usage

### Model Definition (Schema Only)

Models define the data shape - scalar fields only. Computed fields and relations are defined in resolvers.

```typescript
import { model, id, string, int, boolean, datetime, enumType, nullable, list, resolver, lens, router } from "@sylphx/lens-core";
import { z } from "zod";

interface AppContext {
  db: Database;
  user: User | null;
}

// Models define scalar fields only (data shape from DB)
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
  role: enumType(["user", "admin"]),
  createdAt: datetime(),
});

const Post = model("Post", {
  id: id(),
  title: string(),
  content: string(),
  authorId: string(),  // FK to User
  createdAt: datetime(),
});
```

### Resolver Definition (Implementation)

Use `resolver(Model, (t) => ({...}))` to define how fields are resolved:

```typescript
const { resolver, query, mutation } = lens<AppContext>();

// User resolver - expose fields + add computed/relations
const userResolver = resolver(User, (t) => ({
  // Expose scalar fields directly from source data
  id: t.expose('id'),
  name: t.expose('name'),
  email: t.expose('email'),
  role: t.expose('role'),
  createdAt: t.expose('createdAt'),

  // Computed field - plain function
  displayName: ({ source }) => `${source.name} <${source.email}>`,

  // Relation with arguments
  posts: t.args(z.object({ limit: z.number().default(10) }))
    .resolve(({ source, args, ctx }) =>
      ctx.db.posts.filter(p => p.authorId === source.id).slice(0, args.limit)
    ),

  // Live field (real-time updates) with Publisher pattern
  status: t.resolve(({ source, ctx }) => ctx.getStatus(source.id))
    .subscribe(({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${source.id}`, emit);
      onCleanup(unsub);
    }),
}));

// Post resolver
const postResolver = resolver(Post, (t) => ({
  id: t.expose('id'),
  title: t.expose('title'),
  content: t.expose('content'),
  authorId: t.expose('authorId'),
  createdAt: t.expose('createdAt'),

  // Relation - plain function
  author: ({ source, ctx }) => ctx.db.users.get(source.authorId)!,

  // Computed with args
  excerpt: t.args(z.object({ length: z.number().default(100) }))
    .resolve(({ source, args }) => source.content.slice(0, args.length) + "..."),
}));
```

### Operations

```typescript
// Query with model return type
const getUser = query()
  .args(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!);

// Query with nullable return
const findUser = query()
  .args(z.object({ email: z.string() }))
  .returns(nullable(User))
  .resolve(({ args, ctx }) => ctx.db.users.findByEmail(args.email));

// Query with list return
const listUsers = query()
  .returns(list(User))
  .resolve(({ ctx }) => ctx.db.users.findMany());

// Live Query (initial + updates) with Publisher pattern
const watchUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!)
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.db.users.onChange(args.id, emit);
    onCleanup(unsub);
  });

// Mutation
const updateUser = mutation()
  .args(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .resolve(({ args, ctx }) => ctx.db.users.update(args));

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
import { entity as e, temp, now } from "@sylphx/reify";

const { mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

// Sugar syntax
const updateUser = mutation()
  .args(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic("merge")
  .resolve(({ args, ctx }) => ctx.db.users.update(args));

// Reify DSL (multi-entity)
const sendMessage = mutation()
  .args(z.object({ sessionId: z.string().optional(), content: z.string() }))
  .returns(Message)
  .optimistic(({ args }) => [
    e.create(Message, { id: temp(), content: args.content, createdAt: now() }),
  ])
  .resolve(({ args, ctx }) => ctx.db.messages.create(args));
```

## API Summary

### Model Definition

| Pattern | Example |
|---------|---------|
| Define model | `model("Name", { id: id(), ... })` |
| Get from lens | `const { model } = lens<Ctx>()` |

### Resolver Definition

| Pattern | Example |
|---------|---------|
| Define resolver | `resolver(Model, (t) => ({...}))` |
| Expose field | `t.expose('fieldName')` |
| Plain function | `({ source, ctx }) => ...` |
| With arguments | `t.args(schema).resolve(fn)` |
| Live field | `t.resolve(fn).subscribe(fn)` |

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
| `datetime()` | DateTime field |
| `enumType([...])` | Enum field |
| `list(() => E)` | Collection type |
| `nullable(T)` | Make field nullable |

### Operations

| Pattern | Description |
|---------|-------------|
| `.args(schema)` | Define input arguments |
| `.returns(Model)` | Define return type |
| `.resolve(fn)` | One-shot query/mutation |
| `.resolve(fn).subscribe(fn)` | Live query (initial + updates) |
| `.optimistic("merge")` | Simple optimistic update |
| `.optimistic(({ args }) => [...])` | Reify DSL optimistic |

## License

MIT

---

Built with [@sylphx/reify](https://github.com/SylphxAI/reify) and [@sylphx/standard-entity](https://github.com/SylphxAI/standard-entity).

Powered by Sylphx
