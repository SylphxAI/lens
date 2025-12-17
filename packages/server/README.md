# @sylphx/lens-server

Server runtime for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-server
```

## Quick Start

```typescript
import { createApp } from "@sylphx/lens-server";
import { model, id, string, list, router, lens } from "@sylphx/lens-core";
import { z } from "zod";

// Define models
const User = model("User", {
  id: id(),
  name: string(),
  email: string(),
});

// Create typed builders
const { query, mutation, resolver } = lens<{ db: Database }>();

// Define resolver
const userResolver = resolver(User, (t) => ({
  id: t.expose('id'),
  name: t.expose('name'),
  email: t.expose('email'),
}));

// Define operations
const appRouter = router({
  user: {
    get: query()
      .args(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!),

    list: query()
      .returns(list(User))
      .resolve(({ ctx }) => ctx.db.users.findMany()),
  },
});

// Create app
const app = createApp({
  router: appRouter,
  entities: { User },
  resolvers: [userResolver],
  context: () => ({ db: database }),
});

// Start server - app is directly callable
Bun.serve({ fetch: app });
```

## Runtime Support

Works with any runtime - app is directly callable:

```typescript
// Bun
Bun.serve({ fetch: app })

// Deno
Deno.serve(app)

// Cloudflare Workers
export default app

// Node.js (with adapter)
import { createServer } from "node:http";
import { toNodeHandler } from "@whatwg-node/server";
createServer(toNodeHandler(app)).listen(3000);
```

## HTTP Endpoints

The `app.fetch` handler provides:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Execute operations |
| `/__lens/metadata` | GET | Server metadata |
| `/__lens/health` | GET | Health check |

## Live Queries

For real-time updates, use the Publisher pattern:

```typescript
const watchUser = query()
  .args(z.object({ id: z.string() }))
  .resolve(({ args, ctx }) => ctx.db.users.get(args.id)!)
  .subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.db.users.onChange(args.id, (user) => {
      emit(user);
    });
    onCleanup(unsub);
  });
```

## Optimistic Updates

```typescript
import { optimisticPlugin } from "@sylphx/lens-server";

const { mutation, plugins } = lens<AppContext>()
  .withPlugins([optimisticPlugin()]);

const updateUser = mutation()
  .args(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic("merge")
  .resolve(({ args, ctx }) => ctx.db.users.update(args));

const app = createApp({
  router: appRouter,
  plugins,
  // ...
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
  plugins: ServerPlugin[],     // Server plugins (optimistic, etc.)
  context: () => TContext,     // Context factory
  logger: LensLogger,          // Logging (default: silent)
  version: string,             // Server version (default: "1.0.0")
});
```

## License

MIT

---

Built with [@sylphx/lens-core](https://github.com/SylphxAI/Lens).

Powered by Sylphx
