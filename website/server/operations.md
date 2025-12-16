# Operations

Operations define the API endpoints in Lens. There are two types: **queries** (read) and **mutations** (write).

## Query

Queries fetch data and can optionally subscribe to live updates.

```typescript
import { query } from '@sylphx/lens-server'
import { z } from 'zod'

const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
```

### Query Builder Methods

| Method | Description |
|--------|-------------|
| `.input(schema)` | Define input validation with Zod |
| `.returns(model)` | Specify return type (enables field selection) |
| `.resolve(fn)` | Define the resolver function |
| `.subscribe(fn)` | Add live update subscription (Publisher pattern) |

### One-time Query

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    return ctx.db.user.findUnique({ where: { id: input.id } })
  })
```

### Live Query

Add `.subscribe()` for real-time updates:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) =>
    ctx.db.user.findUnique({ where: { id: input.id } })
  )
  .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
    // Subscribe to changes
    const unsub = ctx.pubsub.on(`user:${input.id}`, (user) => {
      emit(user)
    })
    onCleanup(unsub)
  })
```

### Streaming Query (AsyncGenerator)

For chunked responses (like AI chat):

```typescript
const streamChat = query()
  .input(z.object({ prompt: z.string() }))
  .resolve(async function* ({ input, ctx }) {
    const stream = await ctx.ai.chat(input.prompt)
    for await (const chunk of stream) {
      yield { content: chunk }
    }
  })
```

## Mutation

Mutations modify data and return the result.

```typescript
import { mutation } from '@sylphx/lens-server'
import { z } from 'zod'

const createUser = mutation()
  .input(z.object({
    name: z.string(),
    email: z.string().email(),
  }))
  .resolve(({ input, ctx }) => ctx.db.user.create({ data: input }))
```

### Mutation Builder Methods

| Method | Description |
|--------|-------------|
| `.input(schema)` | Define input validation with Zod |
| `.returns(model)` | Specify return type |
| `.resolve(fn)` | Define the resolver function |
| `.optimistic(fn)` | Define optimistic update logic |

### With Return Type

```typescript
const updateUser = mutation()
  .input(z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional(),
  }))
  .returns(User)
  .resolve(({ input, ctx }) => {
    const { id, ...data } = input
    return ctx.db.user.update({ where: { id }, data })
  })
```

### With Optimistic Updates

```typescript
import { tempId } from '@sylphx/lens-core'

const createPost = mutation()
  .input(z.object({
    title: z.string(),
    authorId: z.string(),
  }))
  .returns(Post)
  .resolve(({ input, ctx }) => ctx.db.post.create({ data: input }))
  .optimistic(({ input }) => ({
    id: tempId(),
    title: input.title,
    authorId: input.authorId,
    createdAt: new Date(),
  }))
```

## Resolver Context

Resolvers receive a context object with:

```typescript
interface ResolverContext<TContext> {
  input: TInput       // Validated input
  ctx: TContext       // Request context (db, user, etc.)
  emit?: Emit         // For live queries only
  onCleanup?: (fn) => void  // Cleanup registration
}
```

### Using Context

```typescript
const getMyPosts = query()
  .resolve(({ ctx }) => {
    // ctx contains whatever you returned from context factory
    const userId = ctx.user?.id
    if (!userId) throw new Error('Not authenticated')
    return ctx.db.post.findMany({ where: { authorId: userId } })
  })
```

## Input Validation

All inputs are validated with Zod:

```typescript
const createPost = mutation()
  .input(z.object({
    title: z.string().min(1).max(100),
    content: z.string().optional(),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(false),
  }))
  .resolve(({ input }) => {
    // input is fully typed and validated
    console.log(input.title)  // string
    console.log(input.tags)   // string[]
  })
```

## Return Types

### Without Return Type

```typescript
// Returns whatever the resolver returns
const getUser = query()
  .resolve(() => ({ id: '1', name: 'Alice' }))
```

### With Model Return Type

```typescript
// Enables field selection and type inference
const getUser = query()
  .returns(User)
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
```

### Array Return Type

```typescript
const listUsers = query()
  .returns([User])  // Array of User
  .resolve(({ ctx }) => ctx.db.user.findMany())
```

### Nullable Return Type

```typescript
import { nullable } from '@sylphx/lens-core'

const findUser = query()
  .input(z.object({ email: z.string() }))
  .returns(nullable(User))
  .resolve(({ input, ctx }) =>
    ctx.db.user.findUnique({ where: { email: input.email } })
  )
```

## Error Handling

Throw errors in resolvers:

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    const user = ctx.db.user.find(input.id)
    if (!user) {
      throw new Error('User not found')
    }
    return user
  })
```

Errors are returned to the client:

```typescript
const result = await client.user.get({ id: 'invalid' })
if (result.error) {
  console.error(result.error.message) // "User not found"
}
```

## Complete Example

```typescript
import { router, lens, id, string, boolean, date, optional } from '@sylphx/lens-server'
import { z } from 'zod'

const { model, query, mutation } = lens<AppContext>()

// Model definition
const Post = model('Post', {
  id: id(),
  title: string(),
  content: optional(string()),
  published: boolean(),
  createdAt: date(),
  author: () => User,
}).resolve({
  author: ({ source, ctx }) =>
    ctx.db.user.find(source.authorId),
})

// Operations
export const postRouter = router({
  post: {
    list: query()
      .input(z.object({
        published: z.boolean().optional(),
        limit: z.number().default(10),
      }))
      .returns([Post])
      .resolve(({ input, ctx }) =>
        ctx.db.post.findMany({
          where: { published: input.published },
          take: input.limit,
        })
      ),

    get: query()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) => ctx.db.post.find(input.id)),

    create: mutation()
      .input(z.object({
        title: z.string(),
        content: z.string().optional(),
      }))
      .returns(Post)
      .resolve(({ input, ctx }) =>
        ctx.db.post.create({
          data: {
            ...input,
            authorId: ctx.user.id,
            published: false,
          },
        })
      ),

    publish: mutation()
      .input(z.object({ id: z.string() }))
      .returns(Post)
      .resolve(({ input, ctx }) =>
        ctx.db.post.update({
          where: { id: input.id },
          data: { published: true },
        })
      ),
  },
})
```
