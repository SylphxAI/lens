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

## vs Real-time Platforms

How does Lens compare to dedicated real-time platforms?

### Platform Comparison

| Feature | Lens | Upstash | Supabase | Firebase | Pusher |
|---------|------|---------|----------|----------|--------|
| Architecture | Live Queries | Pub/Sub | Postgres CDC | Document sync | Pub/Sub |
| Transport | HTTP + SSE | WebSocket | WebSocket | WebSocket | WebSocket |
| Serverless | <Icon icon="lucide:check" class="inline-icon text-green" /> Native | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:minus" class="inline-icon text-yellow" /> Partial | <Icon icon="lucide:minus" class="inline-icon text-yellow" /> Partial | <Icon icon="lucide:check" class="inline-icon text-green" /> |
| Cold Start | <Icon icon="lucide:check" class="inline-icon text-green" /> None | <Icon icon="lucide:check" class="inline-icon text-green" /> None | <Icon icon="lucide:x" class="inline-icon text-red" /> Connection | <Icon icon="lucide:x" class="inline-icon text-red" /> Connection | <Icon icon="lucide:check" class="inline-icon text-green" /> None |
| Incremental | <Icon icon="lucide:check" class="inline-icon text-green" /> JSON Patch | <Icon icon="lucide:x" class="inline-icon text-red" /> Full | <Icon icon="lucide:x" class="inline-icon text-red" /> Full | <Icon icon="lucide:check" class="inline-icon text-green" /> Diff | <Icon icon="lucide:x" class="inline-icon text-red" /> Full |
| Type Safety | <Icon icon="lucide:check" class="inline-icon text-green" /> Full | <Icon icon="lucide:minus" class="inline-icon text-yellow" /> SDK | <Icon icon="lucide:minus" class="inline-icon text-yellow" /> Codegen | <Icon icon="lucide:minus" class="inline-icon text-yellow" /> SDK | <Icon icon="lucide:x" class="inline-icon text-red" /> |
| Field Selection | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:check" class="inline-icon text-green" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> |
| Multi-Server | <Icon icon="lucide:check" class="inline-icon text-green" /> Native | Manual | <Icon icon="lucide:x" class="inline-icon text-red" /> | <Icon icon="lucide:x" class="inline-icon text-red" /> | Manual |

### Architecture Differences

**Lens: Live Queries (Poll + Push)**
```
Client ──HTTP──▸ Server ──query──▸ DB
       ◂──SSE───        ◂──emit───
```
- Initial data via HTTP (serverless-friendly)
- Updates pushed via SSE
- Server computes diff, sends JSON Patch
- Reconnect with version for incremental sync

**Traditional: Persistent Connections**
```
Client ══WebSocket══ Server ══Connection══ DB
```
- Requires persistent connection
- Connection handshake overhead
- Not ideal for serverless (cold start, timeout)

### vs Upstash Realtime

Upstash Realtime is a managed pub/sub service:

| Aspect | Lens | Upstash Realtime |
|--------|------|------------------|
| **Focus** | Full API framework | Message transport |
| **Data Model** | Typed queries/mutations | Raw messages |
| **Updates** | Automatic on mutation | Manual publish |
| **Use Case** | App data layer | Event broadcast |

**When to use together:**
```typescript
// Lens for API + Upstash for cross-region sync
const app = createApp({
  storage: upstashStorage({ url, token })  // Upstash Redis for state
})
```

### vs Supabase Realtime

Supabase uses Postgres CDC (Change Data Capture):

| Aspect | Lens | Supabase |
|--------|------|----------|
| **Trigger** | Application-level emit | Database-level CDC |
| **Granularity** | Field selection | Row-level |
| **Serverless** | Native (HTTP + SSE) | Requires connection |
| **Schema** | TypeScript models | Postgres tables |

**Lens advantage:** Application-level control over what triggers updates, not tied to database changes.

### vs Firebase Realtime Database

Firebase syncs document trees:

| Aspect | Lens | Firebase |
|--------|------|----------|
| **Data Model** | Type-safe models | JSON documents |
| **Queries** | Full query language | Limited filters |
| **Vendor Lock** | Self-hosted option | Google Cloud only |
| **Offline** | Version-based sync | Offline-first |

## Serverless Considerations

Lens is designed serverless-first:

### Why HTTP + SSE?

| Transport | Serverless Fit | Reason |
|-----------|---------------|--------|
| HTTP | <Icon icon="lucide:check" class="inline-icon text-green" /> Excellent | Stateless, no cold start penalty |
| SSE | <Icon icon="lucide:check" class="inline-icon text-green" /> Good | Unidirectional, simpler than WS |
| WebSocket | <Icon icon="lucide:x" class="inline-icon text-red" /> Poor | Requires persistent process |

### Serverless Architecture

```typescript
// Vercel/Cloudflare/AWS Lambda compatible
export const GET = createHandler(app)  // Queries
export const POST = createHandler(app) // Mutations

// SSE for subscriptions (streaming response)
export const GET = createSSEHandler(app)
```

### Cold Start Impact

| Platform | Cold Start | Lens Impact |
|----------|------------|-------------|
| Vercel Edge | ~0ms | None |
| Cloudflare Workers | ~0ms | None |
| AWS Lambda | 100-500ms | First query only |
| Traditional WS | 100-500ms | Every reconnect |

**Lens advantage:** Cold start only affects initial query. Subsequent updates stream without re-initialization.

## Performance Analysis

### Latency

| Operation | Lens | WebSocket-based |
|-----------|------|-----------------|
| Initial query | ~50-100ms | ~100-200ms (handshake + query) |
| Updates | ~10-50ms | ~10-30ms |
| Reconnect | ~50ms (with version) | ~100-200ms (full sync) |

### Bandwidth Efficiency

Lens uses JSON Patch for incremental updates:

```typescript
// Initial response (1.2KB)
{ users: [{ id: 1, name: "Alice", ... }, ...50 users] }

// Update: only changed data (47 bytes)
[{ "op": "replace", "path": "/users/0/name", "value": "Alicia" }]
```

| Scenario | Full Sync | JSON Patch | Savings |
|----------|-----------|------------|---------|
| 1 field change in 1KB | 1KB | ~50B | 95% |
| Add item to 10KB list | 10KB | ~200B | 98% |
| No change | 10KB | 0B | 100% |

### Throughput

| Metric | Lens SSE | WebSocket |
|--------|----------|-----------|
| Connections/server | 10,000+ | 10,000+ |
| Messages/sec | 100,000+ | 100,000+ |
| Memory/connection | ~2KB | ~4KB |

**Note:** SSE is unidirectional (server→client), reducing server memory. Client→server uses standard HTTP.

## Cost Comparison

### Serverless Pricing Model

| Platform | Lens Cost | Traditional WS Cost |
|----------|-----------|---------------------|
| Vercel | Per request | Per request + duration |
| Cloudflare | Per request | Durable Objects ($$) |
| AWS | Per request | Per hour (EC2/ECS) |

**Lens advantage:** Pay only for actual queries/mutations. SSE streams don't incur per-message costs on most platforms.

### Example: 10K DAU App

| Component | Lens | Firebase | Supabase |
|-----------|------|----------|----------|
| API calls | ~$5/mo | Included | Included |
| Real-time | ~$2/mo (SSE) | ~$25/mo | ~$25/mo |
| Database | Your choice | Firebase ($) | Postgres ($) |
| **Total** | **~$7/mo + DB** | **~$50/mo** | **~$50/mo** |

*Estimates based on typical usage patterns. Actual costs vary.*

## Summary

| Need | Best Choice |
|------|-------------|
| Full-stack type-safe API | **Lens** |
| Simple pub/sub messaging | Upstash / Pusher |
| Postgres-based app | Supabase |
| Mobile offline-first | Firebase |
| Serverless-first real-time | **Lens** |
| Maximum control | **Lens** (self-hosted) |
