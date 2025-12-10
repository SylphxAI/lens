# Models

Models define the shape of your data with type-safe field definitions and inline resolvers.

## Basic Model

```typescript
import { model } from '@sylphx/lens-core'

const User = model<AppContext>('User', (t) => ({
  // Scalar fields
  id: t.id(),
  name: t.string(),
  email: t.string(),
  age: t.int().optional(),
  isActive: t.boolean(),
  createdAt: t.date(),
  role: t.enum(['user', 'admin', 'vip']),
}))
```

## Field Types

### Scalar Types

| Method | TypeScript Type | Description |
|--------|-----------------|-------------|
| `t.id()` | `string` | Unique identifier |
| `t.string()` | `string` | Text |
| `t.int()` | `number` | Integer |
| `t.float()` | `number` | Floating point |
| `t.boolean()` | `boolean` | True/false |
| `t.date()` | `Date` | Date/time |
| `t.json()` | `unknown` | JSON value |
| `t.enum([...])` | Union type | Enumeration |

### Field Modifiers

```typescript
const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Optional field
  bio: t.string().optional(),

  // Nullable field
  deletedAt: t.date().nullable(),

  // Default value
  role: t.enum(['user', 'admin']).default('user'),
}))
```

## Relations

### One-to-One

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // One-to-one relation
  profile: t.one(() => Profile).resolve(({ parent, ctx }) =>
    ctx.db.profiles.findUnique({ where: { userId: parent.id } })
  ),
}))
```

### One-to-Many

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // One-to-many relation
  posts: t.many(() => Post).resolve(({ parent, ctx }) =>
    ctx.db.posts.findMany({ where: { authorId: parent.id } })
  ),
}))
```

### Lazy References

Use arrow functions to avoid circular dependency issues:

```typescript
const User = model('User', (t) => ({
  posts: t.many(() => Post),  // Lazy reference
}))

const Post = model('Post', (t) => ({
  author: t.one(() => User),  // Lazy reference back
}))
```

## Computed Fields

Fields can be computed from the parent object:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  firstName: t.string(),
  lastName: t.string(),

  // Computed field
  displayName: t.string().resolve(({ parent }) =>
    `${parent.firstName} ${parent.lastName}`
  ),
}))
```

## Field Arguments

Fields can have arguments, like GraphQL:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Field with arguments
  posts: t.many(() => Post)
    .args(z.object({
      first: z.number().default(10),
      published: z.boolean().optional(),
      orderBy: z.enum(['createdAt', 'title']).optional(),
    }))
    .resolve(({ parent, args, ctx }) =>
      ctx.db.posts.findMany({
        where: { authorId: parent.id, published: args.published },
        take: args.first,
        orderBy: args.orderBy ? { [args.orderBy]: 'desc' } : undefined,
      })
    ),

  // Computed with arguments
  postsCount: t.int()
    .args(z.object({ published: z.boolean().optional() }))
    .resolve(({ parent, args, ctx }) =>
      ctx.db.posts.count({
        where: { authorId: parent.id, published: args.published },
      })
    ),
}))
```

### Client Usage

```typescript
client.user.get({ id: '1' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: { title: true }
    },
    postsCount: { args: { published: true } },
  }
})
```

## Live Fields

Fields can subscribe to updates:

```typescript
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),

  // Live field with two-phase resolution
  status: t.string()
    // Phase 1: Initial value (batchable)
    .resolve(({ parent, ctx }) => ctx.db.getStatus(parent.id))
    // Phase 2: Subscribe to updates (Publisher pattern)
    .subscribe(({ parent, ctx }) => ({ emit, onCleanup }) => {
      const unsub = ctx.pubsub.on(`status:${parent.id}`, (status) => {
        emit(status)
      })
      onCleanup(unsub)
    }),
}))
```

See [Live Queries](/server/live-queries) for more details.

## Type Inference

Extract TypeScript types from models:

```typescript
import { InferModelType } from '@sylphx/lens-core'

// Get the TypeScript type
type UserType = InferModelType<typeof User>
// { id: string; name: string; email: string; ... }
```

## Resolver Signature

Field resolvers receive these parameters:

```typescript
({ parent, args, ctx }) => result

// parent: The parent object being resolved
// args: Field arguments (if defined)
// ctx: Request context
// Returns: The field value (sync or async)
```

## GraphQL Comparison

```graphql
# GraphQL
type User {
  id: ID!
  name: String!
  posts(first: Int, published: Boolean): [Post!]!
  postsCount(published: Boolean): Int!
}
```

```typescript
// Lens equivalent
const User = model<AppContext>('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post)
    .args(z.object({
      first: z.number().optional(),
      published: z.boolean().optional(),
    }))
    .resolve(({ parent, args, ctx }) => ...),
  postsCount: t.int()
    .args(z.object({ published: z.boolean().optional() }))
    .resolve(({ parent, args, ctx }) => ...),
}))
```

**Lens advantages:**
- Full TypeScript inference
- No code generation
- Built-in live query support
