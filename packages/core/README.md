# @sylphx/lens-core

Core schema types and utilities for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-core
```

## Usage

```typescript
import { t, entity, query, mutation, router } from "@sylphx/lens-core";

// Define entities
const User = entity("User", {
  id: t.string(),
  name: t.string(),
  email: t.string(),
});

// Define operations
const getUser = query()
  .input(t.object({ id: t.string() }))
  .returns(User)
  .resolve(({ input }) => {
    return { id: input.id, name: "John", email: "john@example.com" };
  });

// Create router
const appRouter = router({
  user: { get: getUser },
});
```

## License

MIT
