# Field Resolvers

Field resolvers compute values for model fields at runtime. Lens uses a chain-based pattern with `.resolve()` and `.subscribe()` methods.

## Basic Resolvers

Define resolvers using the `.resolve()` chain method:

```typescript
import { lens, id, string, int, list } from '@sylphx/lens-core'

type AppContext = { db: Database }

const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  firstName: string(),
  lastName: string(),
  fullName: string(),
  posts: list(() => Post),
}).resolve({
  // Computed field
  fullName: ({ source }) => `${source.firstName} ${source.lastName}`,

  // Relation
  posts: ({ source, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: source.id } }),
})
```

## Resolver Signature

```typescript
.resolve({
  fieldName: ({ source, args, ctx }) => value
})
```

| Parameter | Description |
|-----------|-------------|
| `source` | The parent object being resolved |
| `args` | Field arguments (if defined) |
| `ctx` | Request context |

## Computed Fields

Fields derived from other fields:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  firstName: string(),
  lastName: string(),
  fullName: string(),
  postCount: int(),
}).resolve({
  // Sync computed
  fullName: ({ source }) => `${source.firstName} ${source.lastName}`,

  // Async computed
  postCount: async ({ source, ctx }) =>
    ctx.db.post.count({ where: { authorId: source.id } }),
})
```

## Relations

### One-to-One

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  profileId: string(),
  profile: () => Profile,
}).resolve({
  profile: ({ source, ctx }) =>
    ctx.db.profile.findUnique({ where: { id: source.profileId } }),
})
```

### One-to-Many

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  posts: list(() => Post),
}).resolve({
  posts: ({ source, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: source.id } }),
})
```

### With Arguments

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  posts: list(() => Post),
}).resolve({
  posts: {
    args: z.object({
      limit: z.number().default(10),
      published: z.boolean().optional(),
    }),
    resolve: ({ source, args, ctx }) =>
      ctx.db.post.findMany({
        where: { authorId: source.id, published: args.published },
        take: args.limit,
      }),
  },
})
```

## Live Fields

Fields that push updates in real-time use the two-phase pattern:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  status: string(),
}).resolve({
  // Phase 1: Initial value
  status: ({ source, ctx }) => ctx.db.getStatus(source.id),
}).subscribe({
  // Phase 2: Subscribe to updates (Publisher pattern)
  status: ({ source, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.pubsub.on(`status:${source.id}`, (status) => {
      emit(status)
    })
    onCleanup(unsub)
  },
})
```

See [Live Queries](/server/live-queries) for more details on the Publisher pattern.

## DataLoader Integration

Lens automatically batches field resolution to avoid N+1 queries:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  departmentId: string(),
  department: () => Department,
}).resolve({
  // This is automatically batched when resolving multiple users
  department: ({ source, ctx }) =>
    ctx.db.department.findUnique({ where: { id: source.departmentId } }),
})
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
const { model } = lens<AppContext>()

const User = model('User', {
  departmentId: string(),
  department: () => Department,
}).resolve({
  department: ({ source, ctx }) =>
    ctx.loaders.department.load(source.departmentId),
})
```

## Field Modes

Each field has a resolution mode:

| Mode | Description |
|------|-------------|
| `exposed` | Value comes from source object (no resolver) |
| `resolve` | Computed once per request |
| `live` | Two-phase: resolve + subscribe |

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  // exposed - value from source
  id: id(),
  name: string(),

  // These need resolvers
  fullName: string(),
  status: string(),
}).resolve({
  // resolve - computed
  fullName: ({ source }) => ...,
}).subscribe({
  // live - subscribe for updates
  status: ({ source, ctx }) => ({ emit, onCleanup }) => ...,
})
```

## Error Handling

Handle errors gracefully in resolvers:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  profileId: string(),
  profile: nullable(() => Profile),
}).resolve({
  profile: async ({ source, ctx }) => {
    try {
      return await ctx.db.profile.findUnique({
        where: { id: source.profileId },
      })
    } catch (error) {
      console.error('Failed to load profile:', error)
      return null
    }
  },
})
```

## Best Practices

### 1. Keep Resolvers Simple

```typescript
// ✅ Good: Single responsibility
.resolve({
  fullName: ({ source }) => `${source.firstName} ${source.lastName}`
})

// ❌ Bad: Too much logic
.resolve({
  fullName: ({ source, ctx }) => {
    const settings = ctx.db.settings.findUnique(...)
    const locale = settings?.locale || 'en'
    // ... complex formatting logic
  }
})
```

### 2. Use DataLoader for Relations

```typescript
// ✅ Good: Uses batching
.resolve({
  posts: ({ source, ctx }) => ctx.loaders.postsByAuthor.load(source.id)
})

// ⚠️ Acceptable: Individual queries (auto-batched by Lens)
.resolve({
  posts: ({ source, ctx }) =>
    ctx.db.post.findMany({ where: { authorId: source.id } })
})
```

### 3. Type Your Context

```typescript
interface AppContext {
  db: PrismaClient
  loaders: {
    postsByAuthor: DataLoader<string, Post[]>
  }
}

const { model } = lens<AppContext>()

const User = model('User', {
  posts: list(() => Post),
}).resolve({
  // ctx is fully typed
  posts: ({ source, ctx }) => ctx.loaders.postsByAuthor.load(source.id),
})
```

### 4. Handle Optional Fields

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  profileId: string(),
  // Mark as nullable when it might not exist
  profile: nullable(() => Profile),
}).resolve({
  profile: ({ source, ctx }) =>
    ctx.db.profile.findUnique({ where: { id: source.profileId } }),
})
```
