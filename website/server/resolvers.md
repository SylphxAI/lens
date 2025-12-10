# Field Resolvers

Field resolvers compute values for model fields at runtime. Lens supports two patterns: **inline resolvers** (in models) and **standalone resolvers**.

## Inline Resolvers (Recommended)

Define resolvers directly in your model:

```typescript
import { model } from '@sylphx/lens-core'

const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  firstName: t.string(),
  lastName: t.string(),

  // Computed field
  fullName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),

  // Relation
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: parent.id } })
  ),
}))
```

## Resolver Signature

```typescript
.resolve(({ parent, args, ctx }) => value)
```

| Parameter | Description |
|-----------|-------------|
| `parent` | The parent object being resolved |
| `args` | Field arguments (if defined with `.args()`) |
| `ctx` | Request context |

## Computed Fields

Fields derived from other fields:

```typescript
const User = model<AppContext>('User', (t) => ({
  firstName: t.string(),
  lastName: t.string(),

  // Sync computed
  fullName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),

  // Async computed
  postCount: t.int().resolve(async ({ parent, ctx }) =>
    ctx.db.post.count({ where: { authorId: parent.id } })
  ),
}))
```

## Relations

### One-to-One

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),

  profile: t.one(() => Profile).resolve(({ parent, ctx }) =>
    ctx.db.profile.findUnique({ where: { userId: parent.id } })
  ),
}))
```

### One-to-Many

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),

  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: parent.id } })
  ),
}))
```

### With Arguments

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),

  posts: t.many(() => Post)
    .args(z.object({
      limit: z.number().default(10),
      published: z.boolean().optional(),
    }))
    .resolve(({ parent, args, ctx }) =>
      ctx.db.post.findMany({
        where: { authorId: parent.id, published: args.published },
        take: args.limit,
      })
    ),
}))
```

## Live Fields

Fields that push updates in real-time:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Live field with two-phase resolution
  status: t.string()
    // Phase 1: Initial value
    .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
    // Phase 2: Subscribe to updates
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, (status) => {
        emit(status)
      })
      onCleanup(unsub)
    }),
}))
```

See [Live Queries](/server/live-queries) for more details on the Publisher pattern.

## Standalone Resolvers

For complex cases, use standalone resolver definitions:

```typescript
import { resolver } from '@sylphx/lens-core'

const UserResolver = resolver(User, {
  fullName: {
    resolve: ({ parent }) => `${parent.firstName} ${parent.lastName}`,
  },

  posts: {
    resolve: ({ parent, ctx }) =>
      ctx.db.post.findMany({ where: { authorId: parent.id } }),
  },
})

// Register with app
const app = createApp({
  router: appRouter,
  resolvers: [UserResolver],
})
```

## DataLoader Integration

Lens automatically batches field resolution to avoid N+1 queries:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),

  // This is automatically batched when resolving multiple users
  department: t.one(() => Department).resolve(({ parent, ctx }) =>
    ctx.db.department.findUnique({ where: { id: parent.departmentId } })
  ),
}))
```

For custom batching, use DataLoader directly:

```typescript
// context.ts
import DataLoader from 'dataloader'

export const createContext = () => ({
  loaders: {
    department: new DataLoader(async (ids: string[]) => {
      const depts = await prisma.department.findMany({
        where: { id: { in: ids } },
      })
      return ids.map(id => depts.find(d => d.id === id))
    }),
  },
})

// model
const User = model<AppContext>('User', (t) => ({
  department: t.one(() => Department).resolve(({ parent, ctx }) =>
    ctx.loaders.department.load(parent.departmentId)
  ),
}))
```

## Field Modes

Each field has a resolution mode:

| Mode | Description |
|------|-------------|
| `exposed` | Value comes from parent object (no resolver) |
| `resolve` | Computed once per request |
| `live` | Two-phase: resolve + subscribe |

```typescript
const User = model<AppContext>('User', (t) => ({
  // exposed - value from parent
  id: t.id(),
  name: t.string(),

  // resolve - computed
  fullName: t.string().resolve(({ parent }) => ...),

  // live - resolve + subscribe
  status: t.string()
    .resolve(({ parent, ctx }) => ...)
    .subscribe(({ parent, ctx }) => ...),
}))
```

## Error Handling

Handle errors gracefully in resolvers:

```typescript
const User = model<AppContext>('User', (t) => ({
  profile: t.one(() => Profile)
    .optional()
    .resolve(async ({ parent, ctx }) => {
      try {
        return await ctx.db.profile.findUnique({
          where: { userId: parent.id },
        })
      } catch (error) {
        console.error('Failed to load profile:', error)
        return null
      }
    }),
}))
```

## Best Practices

### 1. Keep Resolvers Simple

```typescript
// ✅ Good: Single responsibility
fullName: t.string().resolve(({ parent }) =>
  `${parent.firstName} ${parent.lastName}`
)

// ❌ Bad: Too much logic
fullName: t.string().resolve(({ parent, ctx }) => {
  const settings = ctx.db.settings.findUnique(...)
  const locale = settings?.locale || 'en'
  // ... complex formatting logic
})
```

### 2. Use DataLoader for Relations

```typescript
// ✅ Good: Uses batching
posts: t.many(() => Post).resolve(({ parent, ctx }) =>
  ctx.loaders.postsByAuthor.load(parent.id)
)

// ⚠️ Acceptable: Individual queries (auto-batched by Lens)
posts: t.many(() => Post).resolve(({ parent, ctx }) =>
  ctx.db.post.findMany({ where: { authorId: parent.id } })
)
```

### 3. Type Your Context

```typescript
interface AppContext {
  db: PrismaClient
  loaders: {
    postsByAuthor: DataLoader<string, Post[]>
  }
}

const User = model<AppContext>('User', (t) => ({
  // ctx is fully typed
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.loaders.postsByAuthor.load(parent.id)
  ),
}))
```

### 4. Handle Optional Fields

```typescript
const User = model<AppContext>('User', (t) => ({
  // Mark as optional when it might not exist
  profile: t.one(() => Profile)
    .optional()
    .resolve(({ parent, ctx }) =>
      ctx.db.profile.findUnique({ where: { userId: parent.id } })
    ),
}))
```
