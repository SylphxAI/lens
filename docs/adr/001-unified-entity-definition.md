# ADR-001: Unified Entity Definition

## Status
Accepted (Implemented)

## Context

Currently, Lens requires two separate definitions for each entity:

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
1. **Function-based entity definition** - `entity(name, (t) => fields)`
2. **Lazy relations** - `t.many(() => Post)` to solve circular references
3. **Inline resolution** - `.resolve()` and `.subscribe()` on field types

### New API

```typescript
const User = entity("User", (t) => ({
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

  // Subscription field
  status: t.json<SessionStatus>().subscribe(({ ctx }) => {
    ctx.emit({ isActive: true, text: "Online" });
  }),
}));
```

### API Comparison

| Current | New |
|---------|-----|
| `entity(name, fields)` | `entity(name, (t) => fields)` |
| `t.hasMany('Post')` | `t.many(() => Post)` |
| `t.hasOne('Profile')` | `t.one(() => Profile)` |
| `resolver(Entity, (f) => {...})` | Inline in entity |
| `f.expose("id")` | `t.id()` (implicit expose) |
| `f.string().resolve(...)` | `t.string().resolve(...)` |
| `f.many(Post).subscribe(...)` | `t.many(() => Post).subscribe(...)` |

### Field Resolution Rules

1. **No `.resolve()` or `.subscribe()`** → Exposed field (passthrough from parent data)
2. **With `.resolve(fn)`** → Computed field (called on demand)
3. **With `.subscribe(fn)`** → Subscription field (streaming)

### Lazy Relations

Circular references solved with arrow functions:

```typescript
// User.ts
const User = entity("User", (t) => ({
  id: t.id(),
  posts: t.many(() => Post),  // Lazy - Post evaluated at runtime
}));

// Post.ts
const Post = entity("Post", (t) => ({
  id: t.id(),
  author: t.one(() => User),  // Lazy - User evaluated at runtime
}));
```

### Type Safety

The new API maintains full type inference:

```typescript
const User = entity("User", (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) => {
    // parent: { id: string; name: string; ... }  ✅ Inferred
    // ctx: TContext                              ✅ Inferred
    return ctx.db.posts.filter(p => p.authorId === parent.id);
  }),
}));
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

## Server Usage

With unified entity definition, just pass entities to the server - no manual resolver conversion needed:

```typescript
// Define entity with inline resolvers
const User = entity('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.filter(p => p.authorId === parent.id)
  ),
}));

// Server auto-detects and converts inline resolvers
const server = createApp({
  entities: { User, Post },  // ✅ Just pass entities
  router,
  // No `resolvers: [...]` needed!
});
```

**Note**: Explicit `resolvers` array still works and takes priority over inline resolvers.

## Backwards Compatibility

- **Old API still works** - `entity(name, fields)` + `resolver()` continues to work
- **Gradual migration** - Can migrate entity by entity
- **No breaking changes** - Major version bump not required initially

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
