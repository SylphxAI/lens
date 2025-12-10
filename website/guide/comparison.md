# Comparison

How does Lens compare to other API frameworks?

## Feature Comparison

| Feature | tRPC | GraphQL | REST | **Lens** |
|---------|------|---------|------|----------|
| Type Safety | <Icon icon="lucide:check" class="inline-icon text-green" /> | Codegen | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> Native |
| Code-first | <Icon icon="lucide:check" class="inline-icon text-green" /> | SDL | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Field Selection | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Field Arguments | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Live Subscriptions | <Icon icon="lucide:x" class="inline-icon text-red" /> | Separate | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> Auto |
| Incremental Updates | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> Diff |
| Streaming | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Optimistic Updates | Manual | Manual | Manual | **Auto** |
| Multi-Server | Manual | Federation | Manual | **Native** |

**Lens = GraphQL's power + Live queries + No codegen**

## vs tRPC

tRPC is excellent for type-safe APIs, but:

### tRPC Limitations
- No field selection (always fetch everything)
- Subscriptions require separate setup
- No automatic live queries
- No incremental updates

### With Lens
```typescript
// Same query serves both one-time and real-time
const getUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => ctx.db.user.find(input.id))

// Client chooses access pattern
await client.user.get({ id })           // One-time
client.user.get({ id }).subscribe(...)  // Real-time!
```

## vs GraphQL

GraphQL pioneered field selection and type-safe APIs, but:

### GraphQL Limitations
- Requires code generation
- Subscriptions are separate from queries
- No automatic incremental updates
- Complex setup with Apollo/Relay

### With Lens
```typescript
// No codegen needed - TypeScript IS the schema
const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post).resolve(...)
}))

// Same query API as GraphQL selection
client.user.get({ id }, {
  select: {
    name: true,
    posts: {
      args: { first: 5 },
      select: { title: true }
    }
  }
})
```

## vs REST

REST is simple but lacks modern features:

### REST Limitations
- No type safety
- Over-fetching (no field selection)
- Manual subscription implementation
- No standard for real-time

### With Lens
```typescript
// Full type safety without code generation
const user = await client.user.get({ id: '123' })
//    ^? User type inferred

// Real-time built-in
client.user.get({ id }).subscribe(callback)
```

## When to Use Lens

**Choose Lens when you need:**
- Real-time updates without separate subscription logic
- GraphQL-like field selection with TypeScript
- Automatic incremental updates
- Type safety without code generation
- Multi-server routing with type safety

**Stick with tRPC/GraphQL when:**
- You have an existing tRPC/GraphQL codebase
- You don't need real-time features
- Your team is already proficient with those tools

## Migration Path

### From tRPC

```typescript
// tRPC
const userRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => db.user.find(input.id))
})

// Lens (very similar!)
const userRouter = router({
  get: query()
    .input(z.object({ id: z.string() }))
    .resolve(({ input, ctx }) => ctx.db.user.find(input.id))
})
```

### From GraphQL

```graphql
# GraphQL SDL
type User {
  id: ID!
  name: String!
  posts(first: Int): [Post!]!
}
```

```typescript
// Lens model (TypeScript)
const User = model('User', (t) => ({
  id: t.id(),
  name: t.string(),
  posts: t.many(() => Post)
    .args(z.object({ first: z.number().optional() }))
    .resolve(({ parent, args, ctx }) =>
      ctx.db.posts.findMany({ authorId: parent.id, take: args.first })
    )
}))
```
