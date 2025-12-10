# ADR-001: Unified Entity Definition

## Status
Accepted (Implemented) → **Superseded by `model()` API**

> **Update (2024)**: The unified entity definition pattern has been further refined into the `model()` API. `entity()` is now deprecated in favor of `model()`. See "Current API" section below.

## Context

Originally, Lens required two separate definitions for each entity:

```typescript
// 1. Entity - defines data shape
const User = entity("User", {
  id: t.id(),
  name: t.string(),
  email: t.string(),
});

// 2. Resolver - defines how to resolve fields
const userResolver = resolver(User, (f) => ({
  id: f.expose("id"),
  name: f.expose("name"),
  email: f.expose("email"),
  posts: f.many(Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),
  status: f.string().subscribe(({ ctx }) => {
    ctx.emit("online");
  }),
}));
```

**Problems:**
1. **Duplication** - Fields defined twice (entity + resolver)
2. **Boilerplate** - `f.expose("field")` for every exposed field
3. **Indirection** - Logic split across files
4. **Type mismatch risk** - Resolver type can diverge from entity type

The split was introduced to solve circular reference issues between entities (User → Post → User).

## Decision

Unify entity and resolver into a single definition using:
1. **Function-based definition** - `model(name, (t) => fields)`
2. **Lazy relations** - `t.many(() => Post)` to solve circular references
3. **Inline resolution** - `.resolve()` and `.subscribe()` on field types

## Current API (Recommended)

```typescript
import { model } from '@sylphx/lens-core';

const User = model<AppContext>("User", (t) => ({
  // Exposed fields (no .resolve() = auto-expose from parent data)
  id: t.id(),
  name: t.string(),
  email: t.string(),

  // Computed field
  fullName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),

  // Relation with lazy reference (solves circular ref)
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),

  // Live field with Publisher pattern
  status: t.string()
    .resolve(({ parent, ctx }) => ctx.getStatus(parent.id))
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, emit);
      onCleanup(unsub);
    }),
}));
```

### Return Type Wrappers

```typescript
import { model, nullable, list } from '@sylphx/lens-core';

// Return types in operations
query().returns(User)                    // User
query().returns(nullable(User))          // User | null
query().returns(list(User))              // User[]
query().returns(nullable(list(User)))    // User[] | null

// Inline model definition
query().returns(model("Stats", (t) => ({
  count: t.int(),
  average: t.float(),
})));
```

### Legacy API (Deprecated)

```typescript
// ❌ DEPRECATED - use model() instead
const User = entity<AppContext>("User").define((t) => ({
  id: t.id(),
  name: t.string(),
}));
```

### API Comparison

| Legacy | Current (model) |
|--------|-----------------|
| `entity(name, fields)` | `model(name, (t) => fields)` |
| `entity<Ctx>(name).define(...)` | `model<Ctx>(name, ...)` |
| `t.hasMany('Post')` | `t.many(() => Post)` |
| `t.hasOne('Profile')` | `t.one(() => Profile)` |
| `resolver(Entity, (f) => {...})` | Inline in model |
| `f.expose("id")` | `t.id()` (implicit expose) |
| `f.string().resolve(...)` | `t.string().resolve(...)` |
| `f.many(Post).subscribe(...)` | `t.many(() => Post).subscribe(...)` |
| `createApp({ entities: {...} })` | `createApp({ router })` (auto-tracked) |

### Field Resolution Rules

1. **No `.resolve()` or `.subscribe()`** → Exposed field (passthrough from parent data)
2. **With `.resolve(fn)`** → Computed field (called on demand)
3. **With `.subscribe(fn)`** → Subscription field (streaming)

### Lazy Relations

Circular references solved with arrow functions:

```typescript
// User.ts
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  posts: t.many(() => Post),  // Lazy - Post evaluated at runtime
}));

// Post.ts
const Post = model<AppContext>("Post", (t) => ({
  id: t.id(),
  author: t.one(() => User),  // Lazy - User evaluated at runtime
}));
```

### Type Safety

The API maintains full type inference:

```typescript
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) => {
    // parent: { id: string; name: string; ... }  ✅ Inferred
    // ctx: AppContext                            ✅ Inferred
    return ctx.db.posts.filter(p => p.authorId === parent.id);
  }),
}));
```

### Typed Context

For typed context in resolvers, pass the context type as a generic:

```typescript
interface AppContext {
  db: Database;
  user: User;
}

// Direct type parameter (recommended)
const User = model<AppContext>("User", (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) => {
    // ctx is typed as AppContext!
    return ctx.db.posts.filter(p => p.authorId === parent.id);
  }),
}));

// Or use lens factory for shared context
const { query, mutation } = lens<AppContext>();
```

## Implementation Plan

### Phase 1: Add `.resolve()` / `.subscribe()` to FieldType ✅
- Extend `FieldType` base class with resolution methods
- Add `ResolvedFieldType<T>` wrapper type
- Add `SubscribedFieldType<T>` wrapper type
- Tests for new field type methods

### Phase 2: Add Lazy Relations ✅
- Add `t.many(() => Entity)` - returns `LazyManyType`
- Add `t.one(() => Entity)` - returns `LazyOneType`
- Support `.resolve()` and `.subscribe()` on lazy relations
- Tests for circular reference handling

### Phase 3: Function-based Entity Definition ✅
- Support `entity(name, (t) => fields)` signature
- Keep `entity(name, fields)` for backwards compatibility
- Extract resolver functions from field definitions
- Tests for both API styles

### Phase 4: Runtime Integration ✅
- Wire field resolvers to execution engine via `createResolverFromEntity()`
- Support mixed exposed/computed/subscription fields
- `hasInlineResolvers()` helper for detection
- **Server auto-converts entities** - No manual `createResolverFromEntity()` call needed
- E2E tests

### Phase 5: Deprecation ✅
- Mark `resolver()` as deprecated with @deprecated JSDoc
- Document migration to unified entity definition
- Legacy API still supported for backwards compatibility

### Phase 6: model() API ✅
- Rename `entity()` to `model()` with cleaner syntax
- Add `nullable()` and `list()` wrapper functions
- Auto-track models from router return types
- Mark `entity()` as deprecated

## Server Usage

Models are **auto-tracked** from router return types - no need for explicit `entities` config:

```typescript
// Define models with inline resolvers
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),
}));

// Operations reference models via .returns()
const getUser = query().returns(User).resolve(...);
const listUsers = query().returns(list(User)).resolve(...);

const appRouter = router({ user: { get: getUser, list: listUsers } });

// Models auto-collected from router!
const server = createApp({
  router: appRouter,  // ✅ User automatically tracked
  context: () => ({ db }),
});

// Or explicit models (optional, takes priority)
const server = createApp({
  router: appRouter,
  entities: { User, Post },  // Override/add explicit models
  context: () => ({ db }),
});
```

**Note**: Explicit `entities` config still works and takes priority over auto-collected models.

## Backwards Compatibility

- **Legacy APIs still work** - `entity()` and `resolver()` continue to work but are deprecated
- **Gradual migration** - Can migrate model by model
- **No breaking changes** - Major version bump not required
- **Migration path**: `entity<Ctx>("Name").define(...)` → `model<Ctx>("Name", ...)`

## Consequences

### Positive
- **Less boilerplate** - One definition instead of two
- **Colocation** - Schema and logic together
- **Type safety** - Single source of truth
- **Simpler mental model** - "Entity = data shape + how to get it"

### Negative
- **Larger entity files** - More code in one place
- **Learning curve** - New API to learn
- **Migration effort** - Existing code needs updating

### Neutral
- **Similar to Pothos/Drizzle** - Familiar pattern from other libraries

## Alternatives Considered

### Option A: Keep Separate (Status Quo)
- Pro: No migration needed
- Con: Continues duplication problem

### Option B: Auto-expose All Fields
- `resolver()` only for computed fields
- Pro: Less boilerplate
- Con: Still two places, implicit behavior

### Option C: Decorator-based (Rejected)
```typescript
@Entity("User")
class User {
  @Field() id: string;
  @Resolve() posts() { ... }
}
```
- Pro: Familiar OOP pattern
- Con: Runtime decorators, worse tree-shaking, not functional

## References

- [Pothos GraphQL](https://pothos-graphql.dev/) - Similar inline field definition pattern
- [Drizzle ORM](https://orm.drizzle.team/) - Schema + relations in one place
- [tRPC](https://trpc.io/) - Functional API design inspiration
