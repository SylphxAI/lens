# ADR-003: Resolver & Subscription Design

## Status
Accepted

## Context

The current API has several issues:
1. **Mixed concerns**: `model().resolve()` chain mixes schema definition with implementation
2. **No subscription operation**: Only query/mutation exist, but event streams need dedicated `subscription()` type
3. **Redundant type definitions**: Resolver builder has `t.string().resolve()` which duplicates types already in model
4. **Manual resolver wiring**: Requires explicit `resolvers: [...]` in createApp

## Decision

### 1. Model = Schema (Single Source of Truth)

Models define ALL field types, including computed fields and relations:

```typescript
const User = model("User", {
  id: id(),
  firstName: string(),
  lastName: string(),
  displayName: string(),      // Computed field - type only
  posts: list(() => Post),    // Relation - type only
});
```

### 2. Resolver = Implementation Only

Resolvers provide implementations without type definitions:

```typescript
const userResolver = resolver(User, (t) => ({
  // Expose source fields explicitly
  id: t.expose("id"),
  firstName: t.expose("firstName"),
  lastName: t.expose("lastName"),

  // Computed field: plain function (no args)
  displayName: ({ source }) => `${source.firstName} ${source.lastName}`,

  // With args: builder pattern for type inference
  posts: t
    .args(z.object({ first: z.number().default(10) }))
    .resolve(({ source, args, ctx }) => ctx.db.getPosts(source.id, args.first))
    .subscribe(({ source, args, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.events.on(`user:${source.id}:posts`, emit);
      onCleanup(unsub);
    }),

  // Resolve + Subscribe (no args)
  status: t
    .resolve(({ source, ctx }) => ctx.getStatus(source.id))
    .subscribe(({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.events.on(`user:${source.id}:status`, emit);
      onCleanup(unsub);
    }),
}));
```

### 3. Explicit Fields Only

Every exposed field must be in the resolver:
- `t.expose("fieldName")` for source fields
- Plain function `({ source }) => ...` for computed fields
- Builder `t.args().resolve().subscribe()` for fields with args or subscriptions

Fields not in resolver = not exposed to client. This is explicit and secure by default.

### 4. Subscription Operation Type

New operation type for event streams (no initial data):

```typescript
const onPostCreated = subscription()
  .input(z.object({ authorId: z.string().optional() }))
  .returns(Post)
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.events.on("post:created", (post) => {
      if (!input.authorId || post.authorId === input.authorId) {
        emit(post);
      }
    });
    onCleanup(unsub);
  });
```

**Difference from Query with subscribe:**
- Query: returns initial data, then pushes updates (live query)
- Subscription: no initial data, only pushes events (event stream)

### 5. Auto-detect Resolvers

Resolvers auto-register by model name:

```typescript
// resolver() auto-registers to global registry
const userResolver = resolver(User, (t) => ({ ... }));

// Server auto-matches resolvers to models from router
createApp({ router: appRouter });  // No resolvers: [] needed!
```

## FieldBuilder API

The `t` builder in resolver provides:

| Method | Purpose |
|--------|---------|
| `t.expose("field")` | Expose source field directly |
| `t.args(schema)` | Add field arguments, returns builder |
| `t.resolve(fn)` | Define resolver, returns chainable |
| `.subscribe(fn)` | Add subscription to resolved field |

**Removed methods** (types already in model):
- ~~`t.string()`~~
- ~~`t.int()`~~
- ~~`t.boolean()`~~
- ~~`t.one(Entity)`~~
- ~~`t.many(Entity)`~~

## Field Resolution Patterns

```typescript
resolver(User, (t) => ({
  // 1. Expose: passthrough from source
  id: t.expose("id"),

  // 2. Simple computed: plain function
  fullName: ({ source }) => `${source.firstName} ${source.lastName}`,

  // 3. Computed with context
  avatar: ({ source, ctx }) => ctx.cdn.getUrl(source.avatarKey),

  // 4. With args
  posts: t
    .args(z.object({ limit: z.number().default(10) }))
    .resolve(({ source, args, ctx }) =>
      ctx.db.posts.filter(p => p.authorId === source.id).slice(0, args.limit)
    ),

  // 5. With subscription (live field)
  status: t
    .resolve(({ source, ctx }) => ctx.getStatus(source.id))
    .subscribe(({ source, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.events.on(`user:${source.id}:status`, emit);
      onCleanup(unsub);
    }),

  // 6. Full: args + resolve + subscribe
  messages: t
    .args(z.object({ since: z.date().optional() }))
    .resolve(({ source, args, ctx }) => ctx.db.getMessages(source.id, args.since))
    .subscribe(({ source, args, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.events.on(`user:${source.id}:messages`, emit);
      onCleanup(unsub);
    }),
}));
```

## Operation Types Summary

| Operation | Initial Data | Updates | Use Case |
|-----------|--------------|---------|----------|
| Query | Yes | No | One-shot fetch |
| Query + field subscribe | Yes | Yes | Live data |
| Mutation | Yes (result) | No | State change |
| Subscription | No | Yes | Event stream |

## Breaking Changes

- `model().resolve()` removed
- `model().subscribe()` removed
- `t.string()`, `t.int()`, etc. removed from resolver builder
- Fields not in resolver = not exposed
- Explicit `resolvers: []` no longer needed (auto-detected)

## Migration

### Before (v2)
```typescript
const User = model("User", {
  id: id(),
  firstName: string(),
  displayName: string(),
}).resolve({
  displayName: ({ source }) => `${source.firstName} ${source.lastName}`,
});

createApp({
  router,
  resolvers: [
    resolver(User, (t) => ({
      id: t.expose("id"),
      displayName: t.string().resolve(({ source }) => ...),
    })),
  ],
});
```

### After (v3)
```typescript
const User = model("User", {
  id: id(),
  firstName: string(),
  displayName: string(),
});

const userResolver = resolver(User, (t) => ({
  id: t.expose("id"),
  firstName: t.expose("firstName"),
  displayName: ({ source }) => `${source.firstName} ${source.lastName}`,
}));

createApp({ router });  // Auto-detects resolvers!
```

## Consequences

### Positive
- Clear separation of concerns (schema vs implementation)
- No redundant type definitions
- Explicit field exposure (secure by default)
- Auto-detection reduces boilerplate
- Subscription operation for true event streams

### Negative
- Breaking change from v2
- More verbose for simple cases (must use `t.expose()`)
- Global registry pattern (but scoped per app)

## References

- [ADR-001: Unified Entity Definition](./001-unified-entity-definition.md)
- [ADR-002: Two-Phase Field Resolution](./002-two-phase-field-resolution.md)
