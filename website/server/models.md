# Models

Models define the shape of your data with type-safe field definitions and resolvers.

## Basic Model

```typescript
import { lens, id, string, int, boolean, nullable } from '@sylphx/lens-core'

type AppContext = { db: Database }

const { model } = lens<AppContext>()

const User = model('User', {
  // Scalar fields
  id: id(),
  name: string(),
  email: string(),
  age: nullable(int()),
  isActive: boolean(),
})
```

## Field Types

### Scalar Types

| Function | TypeScript Type | Description |
|----------|-----------------|-------------|
| `id()` | `string` | Unique identifier |
| `string()` | `string` | Text |
| `int()` | `number` | Integer |
| `float()` | `number` | Floating point |
| `boolean()` | `boolean` | True/false |
| `datetime()` | `Date` | Date/time |
| `timestamp()` | `number` | Unix timestamp |
| `decimal()` | `string` | Decimal number |

### Field Modifiers

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),

  // Nullable field
  bio: nullable(string()),

  // List of values
  tags: list(string()),

  // Nullable list
  metadata: nullable(list(string())),
})
```

## Relations

### One-to-One

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  profileId: string(),

  // One-to-one relation (lazy reference)
  profile: () => Profile,
}).resolve({
  profile: ({ source, ctx }) =>
    ctx.db.profiles.findUnique({ where: { id: source.profileId } })
})
```

### One-to-Many

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),

  // One-to-many relation
  posts: list(() => Post),
}).resolve({
  posts: ({ source, ctx }) =>
    ctx.db.posts.findMany({ where: { authorId: source.id } })
})
```

### Lazy References

Use arrow functions to avoid circular dependency issues:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  posts: list(() => Post),  // Lazy reference
})

const Post = model('Post', {
  id: id(),
  authorId: string(),
  author: () => User,  // Lazy reference back
}).resolve({
  author: ({ source, ctx }) => ctx.db.users.find(source.authorId)
})
```

## Computed Fields

Fields can be computed from the source object:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  firstName: string(),
  lastName: string(),

  // Computed field (declared as string)
  displayName: string(),
}).resolve({
  // Computed from source
  displayName: ({ source }) => `${source.firstName} ${source.lastName}`
})
```

## Field Arguments

Fields can have arguments, like GraphQL:

```typescript
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  posts: list(() => Post),
  postsCount: int(),
}).resolve({
  // Field with arguments
  posts: {
    args: z.object({
      first: z.number().default(10),
      published: z.boolean().optional(),
      orderBy: z.enum(['createdAt', 'title']).optional(),
    }),
    resolve: ({ source, args, ctx }) =>
      ctx.db.posts.findMany({
        where: { authorId: source.id, published: args.published },
        take: args.first,
        orderBy: args.orderBy ? { [args.orderBy]: 'desc' } : undefined,
      })
  },

  // Computed with arguments
  postsCount: {
    args: z.object({ published: z.boolean().optional() }),
    resolve: ({ source, args, ctx }) =>
      ctx.db.posts.count({
        where: { authorId: source.id, published: args.published },
      })
  },
})
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
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  status: string(),
}).resolve({
  // Phase 1: Initial value (batchable)
  status: ({ source, ctx }) => ctx.db.getStatus(source.id)
}).subscribe({
  // Phase 2: Subscribe to updates (Publisher pattern)
  status: ({ source, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.pubsub.on(`status:${source.id}`, (status) => {
      emit(status)
    })
    onCleanup(unsub)
  }
})
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
({ source, args, ctx }) => result

// source: The parent/source object being resolved
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
const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  posts: list(() => Post),
  postsCount: int(),
}).resolve({
  posts: {
    args: z.object({
      first: z.number().optional(),
      published: z.boolean().optional(),
    }),
    resolve: ({ source, args, ctx }) => ...
  },
  postsCount: {
    args: z.object({ published: z.boolean().optional() }),
    resolve: ({ source, args, ctx }) => ...
  },
})
```

**Lens advantages:**
- Full TypeScript inference
- No code generation
- Built-in live query support
