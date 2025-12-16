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
import { lens, id, string, list, nullable, router } from "@sylphx/lens-core";
import { z } from "zod";

// Define context type
interface AppContext {
  db: Database;
  user: User | null;
}

// Create typed builders
const { model, query, mutation } = lens<AppContext>();

// Define models with inline resolvers
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
  posts: list(() => Post),
}).resolve({
  posts: ({ source, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === source.id)
});

const Post = model("Post", {
  id: id(),
  title: string(),
  authorId: string(),
});

// Define operations
const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!),

    find: query()
      .input(z.object({ email: z.string() }))
      .returns(nullable(User))  // User | null
      .resolve(({ input, ctx }) => ctx.db.users.findByEmail(input.email)),

    list: query()
      .returns(list(User))  // User[]
      .resolve(({ ctx }) => ctx.db.users.findMany()),

    update: mutation()
      .input(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.users.update(input)),
  },
});

// Create server - models auto-tracked from router!
const app = createApp({
  router: appRouter,  // Models extracted from .returns()
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
const { model, query, mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

const Message = model("Message", {
  id: id(),
  content: string(),
  createdAt: string(),
});

const appRouter = router({
  user: {
    // Sugar syntax
    update: mutation()
      .input(z.object({ id: z.string(), name: z.string() }))
      .returns(User)
      .optimistic("merge")  // Instant UI update
      .resolve(({ input, ctx }) => ctx.db.users.update(input)),
  },
  message: {
    // Reify DSL (multi-entity)
    send: mutation()
      .input(z.object({ content: z.string(), userId: z.string() }))
      .returns(Message)
      .optimistic(({ input }) => [
        e.create(Message, {
          id: temp(),
          content: input.content,
          createdAt: now(),
        }),
      ])
      .resolve(({ input, ctx }) => ctx.db.messages.create(input)),
  },
});

const app = createApp({
  router: appRouter,
  plugins,  // Include optimistic plugin
  context: () => ({ ... }),
});
```

### Live Queries

```typescript
// query comes from lens<AppContext>() above

// Live query with Publisher pattern
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.users.get(input.id)!)  // Initial value
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    // Publisher callback - emit/onCleanup passed here
    const unsub = ctx.db.users.onChange(input.id, (user) => {
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
  // Required (at least one)
  router: RouterDef,           // Namespaced operations

  // Optional (models auto-tracked from router!)
  entities: EntitiesMap,       // Explicit models (optional, for overrides)
  plugins: ServerPlugin[],     // Server plugins (optimistic, clientState, etc.)
  context: () => TContext,     // Context factory
  logger: LensLogger,          // Logging (default: silent)
  version: string,             // Server version (default: "1.0.0")
});
```

## Auto-tracking Models

Models are automatically collected from router return types:

```typescript
// These models are auto-tracked:
const appRouter = router({
  user: {
    get: query().returns(User).resolve(...),     // User tracked
    list: query().returns(list(User)).resolve(...), // User tracked
    find: query().returns(nullable(User)).resolve(...), // User tracked
  },
  post: {
    get: query().returns(Post).resolve(...),     // Post tracked
  },
});

// No need to pass entities explicitly
const app = createApp({
  router: appRouter,  // User and Post auto-collected
});

// Or override/add explicit models
const app = createApp({
  router: appRouter,
  entities: { User, Post, ExtraModel },  // Explicit takes priority
});
```

## Optimistic Update Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| `"merge"` | Merge input into entity | `.optimistic("merge")` |
| `"create"` | Create with temp ID | `.optimistic("create")` |
| `"delete"` | Mark entity deleted | `.optimistic("delete")` |
| `{ merge: {...} }` | Merge with extra fields | `.optimistic({ merge: { status: "pending" } })` |
| Reify DSL | Multi-entity operations | `.optimistic(({ input }) => [...])` |

## License

MIT

---

Built with [@sylphx/lens-core](https://github.com/SylphxAI/Lens).

Powered by Sylphx
