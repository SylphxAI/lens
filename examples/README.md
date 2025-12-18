# Lens Examples

Choose your learning path based on experience level and time.

## Quick Start (2 minutes)

**[hello-world/](./hello-world/)** - Minimal todo app in 60 lines

```bash
bun run examples/hello-world/main.ts
```

Shows: Model definition, query, mutation, client usage.

---

## Learning Paths

### Path 1: "I want to understand the basics" (15 min)

1. **[hello-world/](./hello-world/)** - Minimal working app
2. **[basic/](./basic/)** - CRUD operations, optimistic updates
3. **[type-inference/](./type-inference/)** - How types flow from server to client

### Path 2: "I want to see real-time features" (10 min)

1. **[hello-world/](./hello-world/)** - Get oriented
2. **[realtime/](./realtime/)** - Subscribe pattern, field selection

### Path 3: "I want to see everything" (30 min)

1. **[v2-complete/](./v2-complete/)** - Full feature demo:
   - Entity relations
   - Field arguments
   - Computed fields
   - Reify pipelines for optimistic updates

---

## Example Overview

| Example | Time | Key Concepts |
|---------|------|--------------|
| [hello-world](./hello-world/) | 2 min | Model, query, mutation |
| [realtime](./realtime/) | 5 min | `.subscribe()`, field selection |
| [basic](./basic/) | 10 min | CRUD, optimistic updates, tests |
| [type-inference](./type-inference/) | 10 min | Type flow, inference chain |
| [v2-complete](./v2-complete/) | 20 min | Relations, args, Reify pipelines |

---

## Running Examples

All examples use workspace dependencies. From the repo root:

```bash
# Run any example directly
bun run examples/hello-world/main.ts
bun run examples/realtime/main.ts
bun run examples/type-inference/demo.ts

# Or from the example directory
cd examples/basic
bun run dev
bun test
```

---

## What's Missing?

Looking for something specific? These are planned:

- **streaming/** - AI/LLM streaming with `yield`
- **websocket/** - Full WebSocket transport example
- **multi-server/** - Routing to multiple backends

Open an issue if you need something else!
