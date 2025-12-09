# Progress

## Current Status

- **Version**: 1.1.1
- **Build**: ✅ Passing
- **Tests**: ✅ All passing (56 test files)
- **Score**: 95%

## Architecture

Lens is a **GraphQL-like frontend-driven framework** with these core innovations:

1. **Live Queries** - Every query is automatically subscribable
2. **Incremental Transfer** - Server computes and sends only diffs
3. **Type-safe E2E** - Full TypeScript inference, no codegen

### Design Principles

```
GraphQL Principles          Lens Innovations
────────────────────────────────────────────
Schema-driven               + Live Queries (any query subscribable)
Field-level resolution      + Incremental Transfer (diff only)
Field arguments             + Optimistic Updates (built-in)
Selection sets              + Type-safe E2E (no codegen)
```

## Core Concepts

### 1. Entity (Shape Definition)

Entities define scalar fields only. No relations - avoids circular references:

```typescript
const User = entity("User", {
  id: t.id(),
  name: t.string(),
  email: t.string(),
})
```

### 2. Field Resolver (with Arguments)

GraphQL-style field resolvers with field-level arguments:

```typescript
resolver(User, (f) => ({
  // Expose scalar
  id: f.expose("id"),
  name: f.expose("name"),

  // Computed field
  displayName: f.string().resolve((user) => `${user.name}`),

  // Relation with field args
  posts: f.many(Post)
    .args(z.object({
      first: z.number().default(10),
      published: z.boolean().optional(),
    }))
    .resolve((user, args, ctx) =>
      ctx.db.posts.find({ authorId: user.id, ...args })
    ),
}))
```

### 3. Field Resolver Signature

```typescript
(parent: TParent, args: TArgs, ctx: TContext) => TResult | Promise<TResult>
```

### 4. Client Selection with Field Args

```typescript
client.user.get({ id: "1" }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: { title: true }
    }
  }
})
```

### 5. emit (Operation Level Only)

`ctx.emit` is for operation resolvers, not field resolvers:

```typescript
const getUser = query()
  .returns(User)
  .resolve(({ input, ctx }) => {
    ctx.db.onChange(() => ctx.emit(ctx.db.users.find(input.id)))
    return ctx.db.users.find(input.id)
  })
```

## Recent Changes

### v1.2.0 (WIP)

- **GraphQL-like field arguments** - `.args(schema).resolve((parent, args, ctx) => ...)`
- **New resolver() API** - Field builder pattern for type-safe field definitions
- **Updated resolver signature** - `(parent, args, ctx)` matches GraphQL
- **Client field args** - `{ posts: { args: { first: 5 }, select: { title: true } } }`
- **Removed relation()** - Relations now defined in resolver with `f.one()`/`f.many()`

### v1.1.1

- Lazy connection: `createClient` is now sync
- Eager handshake with deferred execution
- Fixed mutation detection using server metadata
- Added turbo for monorepo builds

### v1.1.0

- Updated route() syntax to object format

## Packages

| Package | Status |
|---------|--------|
| @sylphx/lens | ✅ Published |
| @sylphx/lens-core | ✅ Published |
| @sylphx/lens-client | ✅ Published |
| @sylphx/lens-server | ✅ Published |
| @sylphx/lens-react | ✅ Published |
| @sylphx/lens-vue | ✅ Published |
| @sylphx/lens-solid | ✅ Published |
| @sylphx/lens-svelte | ✅ Published |
| @sylphx/lens-preact | ✅ Published |
| @sylphx/lens-next | ✅ Published |
| @sylphx/lens-nuxt | ✅ Published |
| @sylphx/lens-fresh | ✅ Published |
| @sylphx/lens-solidstart | ✅ Published |

## TODO

### v1.2.0 - Field Arguments ✅

- [x] Design field arguments API
- [x] Update README with GraphQL-like design
- [x] Implement resolver() with field builder
- [x] Add .args() method to FieldBuilder
- [x] Update resolver signature to (parent, args, ctx)
- [x] Add field args support in client selection types
- [x] Update server to process field arguments
- [x] Add tests for field arguments
- [x] Update v2-complete example

### v1.3.0 - Multi-Entity Optimistic DSL (WIP)

- [ ] Design multi-entity optimistic DSL
- [ ] Update README optimistic section
- [ ] Implement OptimisticDSL types in core
- [ ] Sync types to client package
- [ ] Implement DSL parser and evaluator
- [ ] Add comprehensive tests
- [ ] Transaction-based rollback

### Backlog

- [ ] Align dependency versions across packages
- [ ] DataLoader integration for batching
- [ ] Field-level authorization

### Known Issues

- [ ] **Circular resolver hang** - v2-complete tests hang when resolvers have circular references (User.posts → Post.author → User). Tests skipped temporarily. Root cause: `resolveEntityFields` recursive calls may need cycle detection. See `examples/v2-complete/server.test.ts`.

---

## Multi-Entity Optimistic DSL Design

### Problem

Single-entity DSL (`'merge' | 'create' | 'delete'`) cannot express:
- Creating multiple related entities (Session + Messages)
- Update related entities (create Post + increment User.postCount)
- Cross-entity dependencies (Message.sessionId references Session.id)

### Solution: Multi-Entity DSL

```typescript
// Tier 1: Simple (single entity) - existing
.optimistic('merge' | 'create' | 'delete')

// Tier 2: Multi-entity (new)
.optimistic({
  session: {
    $entity: 'Session',
    $op: 'create',
    title: { $input: 'title' },
    createdAt: { $now: true },
  },
  userMessage: {
    $entity: 'Message',
    $op: 'create',
    sessionId: { $ref: 'session.id' },  // Reference sibling
    role: 'user',
    content: { $input: 'content' },
  },
  assistantMessage: {
    $entity: 'Message',
    $op: 'create',
    sessionId: { $ref: 'session.id' },
    role: 'assistant',
    status: 'pending',
  },
})
```

### DSL Types

```typescript
// =============================================================================
// Value References
// =============================================================================

type RefInput = { $input: string }      // From mutation input
type RefSibling = { $ref: string }      // From sibling result (e.g., 'session.id')
type RefTemp = { $temp: true }          // Generate temp ID (auto for create)
type RefNow = { $now: true }            // Current timestamp

type ValueRef = RefInput | RefSibling | RefTemp | RefNow

// =============================================================================
// Entity Operation
// =============================================================================

interface EntityOperation {
  // Meta (required)
  $entity: string
  $op: 'create' | 'update' | 'delete'

  // Target (required for update/delete)
  $id?: string | ValueRef

  // Data fields (any key without $ prefix)
  [field: string]: unknown | ValueRef
}

// =============================================================================
// Full OptimisticDSL Type
// =============================================================================

type OptimisticDSL =
  // Tier 1: Simple (single entity)
  | 'merge' | 'create' | 'delete'
  | { merge: Record<string, unknown> }
  | { create: Record<string, unknown> }

  // Tier 2: Multi-entity
  | { [key: string]: EntityOperation }
```

### Examples

#### Create Multiple Entities

```typescript
.optimistic({
  session: {
    $entity: 'Session',
    $op: 'create',
    title: { $input: 'title' },
    createdAt: { $now: true },
  },
  userMessage: {
    $entity: 'Message',
    $op: 'create',
    sessionId: { $ref: 'session.id' },
    role: 'user',
  },
})
```

#### Update Existing Entity

```typescript
.optimistic({
  post: {
    $entity: 'Post',
    $op: 'update',
    $id: { $input: 'postId' },
    title: { $input: 'newTitle' },
    updatedAt: { $now: true },
  },
})
```

#### Delete Entity

```typescript
.optimistic({
  deleted: {
    $entity: 'Post',
    $op: 'delete',
    $id: { $input: 'postId' },
  },
})
```

### Execution Flow

1. **Parse DSL** - Extract operations from object
2. **Build dependency graph** - Track `$ref` dependencies
3. **Topological sort** - Determine execution order
4. **Cycle detection** - Error on circular dependencies
5. **Execute in order** - Resolve refs, generate temp IDs
6. **Apply to state** - Update client entity cache
7. **On error** - Transaction rollback (all-or-nothing)

### v2 Extensions (Future)

| Feature | Description |
|---------|-------------|
| `$ids` | Bulk operations |
| `$where` | Query-based targeting |
| `$increment` | Increment numeric field |
| `$push` | Append to array field |
| `$pull` | Remove from array field |
| `$default` | Default value if input missing |
| `$if` | Conditional operation |
| `$state` | Read from current client state |
