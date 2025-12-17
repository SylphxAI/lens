# @sylphx/lens-server

Server runtime for the Lens API framework with WebSocket support.

## Installation

```bash
bun add @sylphx/lens-server
```

## Usage

### Basic Server Setup

```typescript
import { createApp, createHandler } from "@sylphx/lens-server";
import { model, id, string, list, nullable, router, resolver, lens } from "@sylphx/lens-core";
import { z } from "zod";

// Define context type
interface AppContext {
  db: Database;
  user: User | null;
}

// Define models (schema only)
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
});

const Post = model("Post", {
  id: id(),
  title: string(),
  authorId: string(),
});

// Define resolvers (implementation)
const { resolver, query, mutation } = lens<AppContext>();

const userResolver = resolver(User, (t) => ({
  id: t.expose('id'),
  name: t.expose('name'),
  email: t.expose('email'),
  posts: ({ source, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === source.id),
}));

const postResolver = resolver(Post, (t) => ({
  id: t.expose('id'),
  title: t.expose('title'),
  authorId: t.expose('authorId'),
  author: ({ source, ctx }) => ctx.db.users.get(source.authorId)!,
}));

// Define operations
const appRouter = router({
  user: {
    get: query()
      .args(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!),

    find: query()
      .args(z.object({ email: z.string() }))
      .returns(nullable(User))
      .resolve(({ args, ctx }) => ctx.db.users.findByEmail(args.email)),

    list: query()
      .returns(list(User))
      .resolve(({ ctx }) => ctx.db.users.findMany()),

    update: mutation()
      .args(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .resolve(({ args, ctx }) => ctx.db.users.update(args)),
  },
});

// Create server with models and resolvers
const app = createApp({
  router: appRouter,
  entities: { User, Post },
  resolvers: [userResolver, postResolver],
  context: () => ({
    db: database,
    user: getCurrentUser(),
  }),
});

// Start server
const handler = createHandler(app);
Bun.serve({ port: 3000, fetch: handler });
```

### With Optimistic Updates

```typescript
import { createApp, optimisticPlugin } from "@sylphx/lens-server";
import { lens, id, string, router } from "@sylphx/lens-core";
import { entity as e, temp, now } from "@sylphx/reify";

// Enable optimistic plugin
const { mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

const appRouter = router({
  user: {
    // Sugar syntax
    update: mutation()
      .args(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .optimistic("merge")
      .resolve(({ args, ctx }) => ctx.db.users.update(args)),
  },
  message: {
    // Reify DSL (multi-entity)
    send: mutation()
      .args(z.object({ content: z.string(), userId: z.string() }))
      .returns(Message)
      .optimistic(({ args }) => [
        e.create(Message, {
          id: temp(),
          content: args.content,
          createdAt: now(),
        }),
      ])
      .resolve(({ args, ctx }) => ctx.db.messages.create(args)),
  },
});

const app = createApp({
  router: appRouter,
  entities: { User, Message },
  resolvers: [userResolver, messageResolver],
  plugins,
  context: () => ({ ... }),
});
```

### Live Queries

```typescript
// Live query with Publisher pattern
const watchUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!)
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    // Publisher callback - emit/onCleanup passed here
    const unsub = ctx.db.users.onChange(args.id, (user) => {
      emit(user);  // Push update to clients
    });
    onCleanup(unsub);  // Cleanup on disconnect
  });
```

### WebSocket Handler

```typescript
import { createApp, createHandler, createWSHandler } from "@sylphx/lens-server";

const app = createApp({ ... });

// HTTP handler
const httpHandler = createHandler(app);

// WebSocket handler
const wsHandler = createWSHandler(app);

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (req.headers.get("upgrade") === "websocket") {
      return wsHandler.upgrade(req, server);
    }
    return httpHandler(req);
  },
  websocket: wsHandler.websocket,
});
```

## createApp Options

```typescript
createApp({
  // Required
  router: RouterDef,           // Namespaced operations

  // Entities & Resolvers
  entities: EntitiesMap,       // Models for normalization
  resolvers: ResolverDef[],    // Field resolvers array

  // Optional
  plugins: ServerPlugin[],     // Server plugins (optimistic, clientState, etc.)
  context: () => TContext,     // Context factory
  logger: LensLogger,          // Logging (default: silent)
  version: string,             // Server version (default: "1.0.0")
});
```

## Optimistic Update Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| `"merge"` | Merge args into entity | `.optimistic("merge")` |
| `"create"` | Create with temp ID | `.optimistic("create")` |
| `"delete"` | Mark entity deleted | `.optimistic("delete")` |
| `{ merge: {...} }` | Merge with extra fields | `.optimistic({ merge: { status: "pending" } })` |
| Reify DSL | Multi-entity operations | `.optimistic(({ args }) => [...])` |

## License

MIT

---

Built with [@sylphx/lens-core](https://github.com/SylphxAI/Lens).

Powered by Sylphx
