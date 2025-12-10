# TypeScript Patterns

Advanced TypeScript patterns for Lens applications.

## Type Inference

### Router Type Export

Always export your router type:

```typescript
// server/router.ts
export const appRouter = router({
  user: {
    get: query()
      .input(z.object({ id: z.string() }))
      .returns(User)
      .resolve(({ input, ctx }) => ctx.db.user.find(input.id)),
  },
})

// Export for client
export type AppRouter = typeof appRouter
```

### Context Type

Define and use context type consistently:

```typescript
// server/context.ts
export interface AppContext {
  db: PrismaClient
  user: User | null
  loaders: {
    user: DataLoader<string, User>
    post: DataLoader<string, Post>
  }
}

// Use in operations
const getUser = query<AppContext>()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // ctx.db, ctx.user, ctx.loaders are all typed
    return ctx.loaders.user.load(input.id)
  })

// Use in models
const Post = model<AppContext>('Post', (t) => ({
  author: t.one(() => User).resolve(({ parent, ctx }) =>
    ctx.loaders.user.load(parent.authorId)
  ),
}))
```

## Model Type Extraction

### InferModelType

Extract TypeScript type from model:

```typescript
import { InferModelType } from '@sylphx/lens-core'

const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),
  email: t.string(),
  age: t.int().optional(),
}))

type UserType = InferModelType<typeof User>
// { id: string; name: string; email: string; age?: number }
```

### With Relations

```typescript
const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post),
}))

type UserType = InferModelType<typeof User>
// { id: string; name: string; posts: Post[] }
```

## Selection Types

### Type-Safe Selection

```typescript
import type { SelectionObject } from '@sylphx/lens-client'

const userSelection = {
  name: true,
  email: true,
  posts: {
    args: { first: 5 },
    select: {
      title: true,
      createdAt: true,
    },
  },
} satisfies SelectionObject
```

### Inferred Selected Type

```typescript
// The result type is inferred from selection
const user = await client.user.get({ id: '1' }, {
  select: {
    name: true,
    email: true,
  },
})
// user: { name: string; email: string }

const userWithPosts = await client.user.get({ id: '1' }, {
  select: {
    name: true,
    posts: { select: { title: true } },
  },
})
// userWithPosts: { name: string; posts: { title: string }[] }
```

## Generic Operations

### Typed Query Factory

```typescript
function createGetById<T extends ModelDef>(
  model: T,
  resolver: (id: string, ctx: AppContext) => Promise<InferModelType<T>>
) {
  return query<AppContext>()
    .input(z.object({ id: z.string() }))
    .returns(model)
    .resolve(({ input, ctx }) => resolver(input.id, ctx))
}

// Usage
const getUser = createGetById(User, (id, ctx) => ctx.db.user.find(id))
const getPost = createGetById(Post, (id, ctx) => ctx.db.post.find(id))
```

### Typed Mutation Factory

```typescript
function createCRUD<T extends ModelDef>(
  name: string,
  model: T,
  db: { find: Function; create: Function; update: Function; delete: Function }
) {
  return {
    get: query<AppContext>()
      .input(z.object({ id: z.string() }))
      .returns(model)
      .resolve(({ input }) => db.find(input.id)),

    create: mutation<AppContext>()
      .input(z.object({ data: z.any() }))
      .returns(model)
      .resolve(({ input }) => db.create(input.data)),

    update: mutation<AppContext>()
      .input(z.object({ id: z.string(), data: z.any() }))
      .returns(model)
      .resolve(({ input }) => db.update(input.id, input.data)),

    delete: mutation<AppContext>()
      .input(z.object({ id: z.string() }))
      .resolve(({ input }) => db.delete(input.id)),
  }
}
```

## Conditional Types

### Based on Field Selection

```typescript
type SelectedFields<T, S extends SelectionObject> = {
  [K in keyof S & keyof T]: S[K] extends true
    ? T[K]
    : S[K] extends { select: infer NS }
      ? NS extends SelectionObject
        ? SelectedFields<T[K], NS>
        : never
      : never
}
```

### Based on Operation Type

```typescript
type OperationResult<T> = T extends QueryDef<infer _I, infer O>
  ? O
  : T extends MutationDef<infer _I, infer O>
    ? O
    : never

// Usage
type GetUserResult = OperationResult<typeof getUser>
```

## Utility Types

### DeepPartial

```typescript
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P]
}

// Usage: Update input
const updateUser = mutation()
  .input(z.object({
    id: z.string(),
    data: z.custom<DeepPartial<User>>(),
  }))
```

### RequireAtLeastOne

```typescript
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys]

// Usage: At least one field to update
type UpdateUserInput = RequireAtLeastOne<{
  name?: string
  email?: string
  bio?: string
}, 'name' | 'email' | 'bio'>
```

### Branded Types

```typescript
type Brand<T, B> = T & { __brand: B }

type UserId = Brand<string, 'UserId'>
type PostId = Brand<string, 'PostId'>

// Type-safe IDs
function getUser(id: UserId): Promise<User> { ... }
function getPost(id: PostId): Promise<Post> { ... }

const userId = '123' as UserId
const postId = '456' as PostId

getUser(userId)  // ✅
getUser(postId)  // ❌ Type error
```

## Best Practices

### 1. Centralize Types

```typescript
// types/index.ts
export type { AppContext } from './context'
export type { AppRouter } from './router'
export type { User, Post, Comment } from './models'
```

### 2. Use `satisfies`

```typescript
// Validate shape without widening
const config = {
  timeout: 5000,
  retries: 3,
} satisfies ClientConfig

// config type is { timeout: number; retries: number }
// not ClientConfig
```

### 3. Avoid `any`

```typescript
// ❌ Bad
.resolve(({ input }: any) => ...)

// ✅ Good
.resolve(({ input, ctx }) => ...)  // Types inferred
```

### 4. Use Generics Wisely

```typescript
// ✅ Good: Generic where needed
function createQuery<T>(model: ModelDef<T>) { ... }

// ❌ Bad: Over-generic
function createQuery<T, U, V, W>(...) { ... }
```

### 5. Document Complex Types

```typescript
/**
 * Represents a user with their related data.
 *
 * @example
 * ```typescript
 * const user: UserWithPosts = {
 *   id: '1',
 *   name: 'Alice',
 *   posts: [{ id: '1', title: 'Hello' }]
 * }
 * ```
 */
type UserWithPosts = User & { posts: Post[] }
```
