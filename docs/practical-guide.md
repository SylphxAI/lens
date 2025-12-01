# Lens Practical Guide

> **Core Principle**: Live Query — Every Query is Streaming

---

## Design Philosophy: Not "Real-time", Just "Natural"

Traditional API frameworks (tRPC, GraphQL) treat "one-time fetch" and "real-time updates" as separate concerns:

```typescript
// Traditional approach — two separate systems
const getUser = query()...           // One-time
const onUserChange = subscription()... // Real-time

// Lens approach — one system, all scenarios
const getUser = query()...
// Client decides how to use it:
await client.user.get({ id })           // One-time
client.user.get({ id }).subscribe(...)  // Real-time
```

**The Essence of Lens**:
- **Server** describes "what data can be provided" and "how it updates"
- **Client** describes "what data this page needs"
- **Everything in between — sync, diffing, transfer optimization — Lens handles automatically**

---

## First Principle: Client Only Describes

The client doesn't need to know where data comes from or how it updates. It only needs to say:

```typescript
// "This page needs user 123's name and email"
client.user.get({ id: '123' }, {
  select: { name: true, email: true }
}).subscribe((user) => {
  // This callback fires when:
  // 1. Initial data arrives
  // 2. name or email changes
  // 3. bio changes — NOT called (not selected)
})
```

**You don't need to care about**:
- Whether data comes via HTTP or WebSocket
- When the server pushes updates
- Whether transfer is full data or diff
- How to compute diffs or merge updates

**You only describe**: "What data do I need"

---

## Second Principle: Server Describes Possibilities

The server defines "what data can be provided" and "how data changes":

### Basic Pattern: Return (Return Once)

```typescript
const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => {
    // Return data, Lens tracks it
    return ctx.db.user.find(input.id)
  })
```

After a client subscribes, if User:123 is updated anywhere (mutation, other query), Lens automatically pushes changes to subscribed clients.

### Advanced Pattern: Emit (Push Updates)

When you need to listen to external data sources:

```typescript
const watchUser = query()
  .input(z.object({ id: z.string() }))
  .resolve(({ input, ctx }) => {
    // Listen to external changes
    const unsubscribe = ctx.db.user.onChange(input.id, (updated) => {
      // Push update
      ctx.emit({ name: updated.name, lastSeen: new Date() })
    })

    // Cleanup when client disconnects
    ctx.onCleanup(unsubscribe)

    // Return initial data
    return ctx.db.user.find(input.id)
  })
```

### Streaming Pattern: Yield (Push Sequentially)

For AI chat, pagination, feeds:

```typescript
const chat = query()
  .input(z.object({ prompt: z.string() }))
  .resolve(async function* ({ input, ctx }) {
    const stream = ctx.openai.createCompletion(input.prompt)

    let content = ''
    for await (const token of stream) {
      content += token
      yield { content }  // Each token pushed immediately
    }
  })
```

---

## Third Principle: Automatic Magic

### 1. Automatic Diff Calculation

You write:
```typescript
ctx.emit({ name: 'Alice Updated' })
```

Lens automatically:
1. Finds all clients subscribed to this entity
2. Calculates diff each client needs (they select different fields)
3. Selects optimal transfer strategy (value/delta/patch)
4. Sends only required data

### 2. Automatic Transfer Optimization

| Data Type | Strategy | Savings |
|-----------|----------|---------|
| Short strings (<100 chars) | value (full replace) | - |
| Long strings (≥100 chars) | delta (char diff) | ~57% |
| Objects (≥50 chars) | patch (JSON Patch) | ~99% |

You don't think about this. Lens handles it automatically.

### 3. Automatic Optimistic Updates

Server defines:
```typescript
const updateUser = mutation()
  .input(z.object({ id: z.string(), name: z.string() }))
  .returns(User)
  .optimistic('merge')  // Declare strategy
  .resolve(...)
```

Client automatically:
1. Before sending mutation, applies optimistic update
2. UI updates instantly
3. Server responds, replaces with real data
4. On error, automatically rolls back

---

## Real-World Scenarios

### Scenario 1: User Profile Page

**Server**:
```typescript
// entities/user.ts
export const User = entity('User', {
  id: t.id(),
  name: t.string(),
  email: t.string(),
  avatar: t.string().optional(),
  bio: t.string().optional(),
})

// routers/user.ts
export const userRouter = router({
  get: query()
    .input(z.object({ id: z.string() }))
    .returns(User)
    .resolve(({ input, ctx }) => ctx.db.user.findUnique({
      where: { id: input.id }
    })),

  update: mutation()
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      bio: z.string().optional()
    }))
    .returns(User)
    .optimistic('merge')
    .resolve(({ input, ctx }) => ctx.db.user.update({
      where: { id: input.id },
      data: input,
    })),
})
```

**Client (React)**:
```tsx
function UserProfile({ userId }: { userId: string }) {
  const { data: user, loading } = useQuery(
    client.user.get({ id: userId }, {
      select: { name: true, email: true, bio: true }
    })
  )

  const { mutate: updateUser } = useMutation(client.user.update)

  if (loading) return <Spinner />

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <EditableText
        value={user.bio}
        onSave={(bio) => updateUser({ id: userId, bio })}
      />
    </div>
  )
}
```

**What happens**:
1. Component mounts → subscribes to User:userId
2. Server returns initial data
3. User edits bio → mutation sent
4. UI updates instantly (optimistic)
5. Server confirms → maintain / rollback
6. If updated elsewhere (e.g., admin panel) → auto push update

### Scenario 2: Real-time Dashboard

**Server**:
```typescript
const getDashboard = query()
  .resolve(({ ctx }) => {
    // Subscribe to multiple data sources
    const unsubMetrics = ctx.metrics.onChange((m) => {
      ctx.emit.set('metrics', m)
    })

    const unsubAlerts = ctx.alerts.onChange((a) => {
      ctx.emit.set('alerts', a)
    })

    ctx.onCleanup(() => {
      unsubMetrics()
      unsubAlerts()
    })

    return {
      metrics: ctx.metrics.getCurrent(),
      alerts: ctx.alerts.getCurrent(),
    }
  })
```

**Client**:
```tsx
function Dashboard() {
  const { data } = useQuery(client.dashboard.get())

  return (
    <div>
      <MetricsChart data={data?.metrics} />
      <AlertsList alerts={data?.alerts} />
    </div>
  )
}
```

**What happens**:
- One subscription handles all real-time updates
- Metrics change → only push metrics
- Alerts change → only push alerts
- Client unaware of complexity, just sees data update automatically

### Scenario 3: AI Chat Streaming

**Server**:
```typescript
const chat = query()
  .input(z.object({
    messages: z.array(MessageSchema)
  }))
  .resolve(async function* ({ input, ctx }) {
    const stream = await ctx.openai.chat.completions.create({
      model: 'gpt-4',
      messages: input.messages,
      stream: true,
    })

    let content = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ''
      content += token
      yield { role: 'assistant', content }
    }
  })
```

**Client**:
```tsx
function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([])

  const handleSend = async (prompt: string) => {
    const userMessage = { role: 'user', content: prompt }
    setMessages(prev => [...prev, userMessage])

    // Subscribe to stream
    client.chat({ messages: [...messages, userMessage] })
      .subscribe((response) => {
        // Fires for each token
        setMessages(prev => [
          ...prev.slice(0, -1),
          response
        ])
      })
  }

  return (
    <div>
      {messages.map((m, i) => <Message key={i} {...m} />)}
      <ChatInput onSend={handleSend} />
    </div>
  )
}
```

### Scenario 4: Collaborative Editing

**Server**:
```typescript
const getDocument = query()
  .input(z.object({ docId: z.string() }))
  .resolve(({ input, ctx }) => {
    const doc = ctx.docs.get(input.docId)

    // Listen to all users' edits
    const unsub = doc.onUpdate((data) => {
      ctx.emit(data)
    })

    ctx.onCleanup(unsub)
    return doc.getData()
  })

const updateDocument = mutation()
  .input(z.object({ docId: z.string(), content: z.string() }))
  .resolve(({ input, ctx }) => {
    // Update triggers onUpdate → emit → all subscribers receive
    return ctx.docs.update(input.docId, { content: input.content })
  })
```

**Client A and Client B subscribe to the same document**:
- A edits → mutation → Server updates
- Server triggers onUpdate → emit
- B receives update (automatic)
- A also receives confirmation (automatic)

### Scenario 5: Pagination with Live Updates

**Server**:
```typescript
const getPosts = query()
  .input(z.object({
    cursor: z.string().optional(),
    limit: z.number().default(20)
  }))
  .returns([Post])
  .resolve(({ input, ctx }) => {
    // Listen for new posts
    const unsub = ctx.posts.onNew((newPost) => {
      ctx.emit.unshift(newPost)  // Add to front
    })

    ctx.onCleanup(unsub)

    return ctx.db.posts.findMany({
      cursor: input.cursor,
      take: input.limit,
      orderBy: { createdAt: 'desc' },
    })
  })
```

**Client**:
```tsx
function PostFeed() {
  const { data: posts } = useQuery(
    client.posts.get({ limit: 20 })
  )

  // posts auto-updates:
  // - Initial load: 20 posts
  // - Someone posts: auto-added to front
  // - Post edited: auto-updated

  return (
    <div>
      {posts?.map(post => <PostCard key={post.id} post={post} />)}
    </div>
  )
}
```

---

## Best Practices

### 1. Only Select Fields You Need

```typescript
// ❌ Bad: get all fields
client.user.get({ id })

// ✅ Good: only what you need
client.user.get({ id }, {
  select: { name: true, avatar: true }
})
```

**Benefits**:
- Reduced transfer size
- Server only pushes changes to fields you care about

### 2. Organize API with Router

```typescript
// ❌ Bad: flat structure
export const getUser = query()...
export const createUser = mutation()...
export const getPost = query()...

// ✅ Good: organize by domain
export const appRouter = router({
  user: router({
    get: query()...,
    create: mutation()...,
    update: mutation()...,
  }),
  post: router({
    get: query()...,
    list: query()...,
    create: mutation()...,
  }),
})
```

### 3. Type-Safe Context

```typescript
// Define context type
type AppContext = {
  db: Database
  user: User | null
  cache: Redis
}

// Use lens factory with preset context
const { query, mutation } = lens<AppContext>()

// All resolvers have typed ctx
const getUser = query()
  .resolve(({ ctx }) => {
    ctx.db      // ✅ typed
    ctx.user    // ✅ typed
    ctx.cache   // ✅ typed
  })
```

### 4. Use Optimistic Updates

```typescript
// Simple cases: use sugar syntax
.optimistic('merge')   // Update: merge input into entity
.optimistic('create')  // Create: auto-generate tempId
.optimistic('delete')  // Delete: mark as deleted

// Complex cases: use callback
.optimistic(({ input }) => [
  e.update('User', { id: input.id, name: input.name }),
  e.update('Profile', { userId: input.id, lastUpdated: now() }),
])
```

### 5. Always Cleanup

```typescript
const watchUser = query()
  .resolve(({ input, ctx }) => {
    // Subscribe to external resources
    const unsub1 = ctx.db.onChange(...)
    const unsub2 = ctx.ws.subscribe(...)

    // Always cleanup!
    ctx.onCleanup(() => {
      unsub1()
      unsub2()
    })

    return initialData
  })
```

### 6. Handle N+1 with Field Resolvers

```typescript
const userResolver = resolver(User, (f) => ({
  // Use DataLoader pattern
  posts: f.many(Post)
    .args(z.object({ first: z.number().default(10) }))
    .resolve(({ parent, args, ctx }) => {
      // ctx.loaders is a fresh DataLoader per request
      return ctx.loaders.postsByAuthor.load({
        authorId: parent.id,
        limit: args.first,
      })
    }),
}))
```

---

## Summary: The Core Value of Lens

| What You Write | What Lens Handles |
|----------------|-------------------|
| `query().resolve(...)` | Track all subscribers |
| `ctx.emit({ name })` | Compute diff, select transfer strategy, push only needed |
| `client.user.get().subscribe()` | WebSocket connection, reconnect, message parsing |
| `.select({ name: true })` | Only push name changes |
| `.optimistic('merge')` | Optimistic update, confirm/rollback |

**One-liner**:

> You describe "what can be provided" and "what you need". Lens handles everything in between.

---

## Next Steps

1. Check [Examples](../examples/) for complete examples
2. Try [Quick Start](./quick-start.md) to get started
3. Reference [API Reference](./api-reference.md) for detailed docs
