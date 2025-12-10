# Type Inference Example

This example demonstrates the complete type inference chain in Lens:

```
app._types.router → inProcess({ app }) → TypedTransport → createClient() → typed client
```

## What This Example Shows

1. **Model Type Inference**: How `.returns(Model)` provides full type inference
2. **Query Type Inference**: How query input/output types flow through the chain
3. **Mutation Type Inference**: How mutation types work with optimistic updates
4. **End-to-End Safety**: How the client automatically gets correct types from server

## Running the Example

```bash
# From the repo root
bun run examples/type-inference/demo.ts
```

## Key Patterns

### 1. Define Models with `model()` and `t`

```typescript
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  role: t.enum(["user", "admin"]),
  bio: t.string().optional(),
}));
```

### 2. Use `lens<Context>()` for Typed Builders

```typescript
interface AppContext {
  db: Database;
  currentUser: User | null;
}

const { query, mutation } = lens<AppContext>();
```

### 3. Chain `.returns(Entity)` for Output Types

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)  // ← This sets the output type!
  .resolve(({ input, ctx }) => {
    const user = ctx.db.users.get(input.id);
    if (!user) throw new Error("Not found");
    return user;  // TypeScript knows this must match User shape
  });
```

### 4. Create Client with `inProcess()` for Full Type Inference

```typescript
const app = createApp({ router: appRouter, context: () => ({...}) });

// Full type inference - no manual types needed!
const client = createClient({
  transport: inProcess({ app }),
});

// client.user.get is fully typed
const user = await client.user.get({ id: "1" });
// user.name is string, user.role is "user" | "admin", etc.
```

## Type Safety Examples

```typescript
// ✅ Correct - TypeScript knows the shape
const name: string = user.name;
const role: "user" | "admin" = user.role;

// ❌ Error - TypeScript catches wrong types
const wrong: number = user.name;  // Error: string not assignable to number

// ❌ Error - TypeScript catches missing properties
const bad = user.nonExistent;  // Error: Property doesn't exist

// ✅ Optional fields are typed correctly
const bio: string | undefined = user.bio;
```

## Files

- `demo.ts` - Complete working example with all patterns
- `server.ts` - Server setup with typed operations
- `client.ts` - Client usage demonstrating type inference
