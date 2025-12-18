# PRODUCT

## Vision

**Lens is the API framework that makes real-time the default, not an afterthought.**

The web is evolving from request-response to always-live. Yet building real-time apps today requires:
- Separate endpoints for queries vs subscriptions
- Manual cache invalidation and state synchronization
- Complex WebSocket management and reconnection logic
- Choosing upfront whether data needs to be "live"

**Lens eliminates this complexity.** Every query is automatically a subscription. The server tracks state and pushes minimal diffs. Developers write once, users get instant updates.

### Mission

Make real-time as easy as REST. Enable any developer to build collaborative, live applications without becoming a distributed systems expert.

---

## Success Metrics

### Adoption (Primary)
- **GitHub Stars**: Target 5K within 12 months (current: early stage)
- **npm Weekly Downloads**: Target 10K/week within 12 months
- **Active Projects**: Track through Discord/community engagement

### Developer Experience
- **Time to First Query**: < 5 minutes from install to working real-time query
- **Migration Effort**: < 1 day to migrate from tRPC for typical apps
- **Documentation Coverage**: 100% of public APIs documented with examples

### Technical Quality
- **Test Coverage**: > 90% across core packages
- **Bundle Size**: < 10KB gzipped for client-only usage
- **Performance**: < 5ms overhead per operation vs raw HTTP

---

## Target Users

### Primary: Full-Stack TypeScript Developers
- **Who**: Developers building modern web apps with React/Vue/Solid + Node/Bun
- **Pain Points**:
  - Tired of writing separate subscription logic
  - Want type safety without GraphQL codegen
  - Need real-time features but don't want WebSocket complexity
  - Using tRPC but hitting limitations (no subscriptions, no field selection)

### Secondary: Teams Scaling Real-Time Apps
- **Who**: Startups/teams with chat, collaboration, or dashboard features
- **Pain Points**:
  - Current solutions (Pusher, Ably) are expensive at scale
  - GraphQL subscriptions are complex to set up
  - Cache invalidation is a constant source of bugs

### Tertiary: Framework Authors
- **Who**: Developers building meta-frameworks or internal tools
- **Pain Points**:
  - Need composable, extensible primitives
  - Want clean separation of concerns (transport vs logic)
  - Require multi-server routing for microservices

---

## Value Propositions

### 1. "Every Query is Live" (Primary Differentiator)
**What**: Define a query once, clients can fetch or subscribe.
**Why It Matters**: No more duplicate code for real-time vs one-time data.
**Proof**: Same resolver works for `await client.user.get()` and `client.user.get().subscribe()`.

### 2. Minimal Diff Updates (Technical Moat)
**What**: Server automatically computes and sends only changed fields.
**Why It Matters**: 10-100x bandwidth savings for large objects.
**Proof**: Update 1 field in a 5KB object = send ~50 bytes, not 5KB.

### 3. TypeScript-Native (No Codegen)
**What**: Full type inference from server to client without build steps.
**Why It Matters**: Faster iteration, no broken schemas, better DX.
**Proof**: Change server type → client gets instant red squiggles.

### 4. Multi-Server Native
**What**: Route different operations to different backends, types merge automatically.
**Why It Matters**: Microservices without losing type safety or adding complexity.
**Proof**: `route({ 'auth.*': authServer, '*': mainServer })` just works.

### 5. Deployment Flexible
**What**: Works on serverless (Vercel, Cloudflare), traditional servers, or edge.
**Why It Matters**: No architectural lock-in, use what you have.
**Proof**: Same server code deploys to Lambda, Bun, or Cloudflare Workers.

---

## Key Features

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| **Core** ||||
| Query/Mutation operations | Stable | P0 | Foundation |
| Type-safe router | Stable | P0 | Foundation |
| Field selection | Stable | P0 | GraphQL-like selection |
| Field arguments | Stable | P0 | Args on any field |
| Zod validation | Stable | P0 | Schema validation |
| **Real-Time** ||||
| Live queries (subscribe) | Stable | P0 | Core differentiator |
| Automatic diff computation | Stable | P0 | Bandwidth optimization |
| Update strategies (value/delta/patch) | Stable | P0 | Intelligent transfer |
| Streaming (yield) | Stable | P1 | AI/LLM use cases |
| Emit API (object/array) | Stable | P1 | Developer ergonomics |
| **Transport** ||||
| HTTP transport | Stable | P0 | Universal baseline |
| WebSocket transport | Stable | P0 | Full real-time |
| SSE transport | Stable | P1 | Serverless real-time |
| Multi-server routing | Stable | P1 | Microservices |
| Route by operation type | Stable | P1 | Mixed transports |
| **Adapters** ||||
| HTTP adapter | Stable | P0 | Universal |
| WebSocket adapter | Stable | P0 | Traditional servers |
| SSE adapter | Stable | P1 | Edge/serverless |
| **Storage** ||||
| In-memory state | Stable | P0 | Default |
| Redis storage | Beta | P1 | Horizontal scaling |
| Upstash storage | Beta | P2 | Serverless Redis |
| Vercel KV storage | Beta | P2 | Vercel ecosystem |
| **Framework Bindings** ||||
| React hooks | Stable | P0 | Primary audience |
| Vue composables | Stable | P1 | Vue ecosystem |
| Solid primitives | Stable | P1 | Solid ecosystem |
| Svelte stores | Stable | P1 | Svelte ecosystem |
| Preact hooks/signals | Stable | P2 | Preact ecosystem |
| **Meta-Framework** ||||
| Next.js integration | Beta | P1 | RSC support |
| Nuxt integration | Beta | P2 | Vue ecosystem |
| SolidStart integration | Beta | P2 | Solid ecosystem |
| Fresh integration | Beta | P3 | Deno ecosystem |
| **Advanced** ||||
| Plugin system | Stable | P1 | Extensibility |
| Optimistic updates | Beta | P1 | UX improvement |
| Reify pipeline integration | Beta | P2 | Multi-entity optimistic |
| Reconnection handling | Stable | P1 | Reliability |

---

## Competitive Landscape

### Direct Competitors

| | **Lens** | **tRPC** | **GraphQL** | **REST + Pusher** |
|---|---|---|---|---|
| Type Safety | Native TS | Native TS | Codegen | Manual |
| Real-Time | Auto | Manual WS | Separate SDL | Separate service |
| Field Selection | Yes | No | Yes | No |
| Diff Updates | Auto | No | No | Manual |
| Learning Curve | Low | Low | High | Medium |
| Bundle Size | ~8KB | ~6KB | ~30KB+ | ~15KB |

### Positioning

**vs tRPC**: "tRPC with superpowers" - same DX, add real-time and field selection.
**vs GraphQL**: "GraphQL power without GraphQL pain" - no SDL, no codegen, simpler mental model.
**vs REST + Pusher**: "Unified real-time" - one system instead of two, auto cache sync.

### Differentiation Strategy

1. **"Live by default"** - No competitor offers automatic subscription for every query
2. **"Minimal diffs"** - Unique server-side diff computation
3. **"Zero config real-time"** - Works without external services (vs Pusher/Ably dependency)

---

## Roadmap

### Now (Current Sprint)
- Production-harden core packages
- Complete test coverage for all frameworks
- Documentation site with interactive examples
- Performance benchmarks vs tRPC/GraphQL

### Next (Next 2-4 Weeks)
- Cursor-based pagination helpers
- Batch operations support
- Dev tools (browser extension for debugging)
- Error boundary integration for React

### Later (Next Quarter)
- Schema stitching for multiple routers
- Rate limiting plugin
- Caching plugin with TTL
- OpenAPI/REST adapter for gradual migration
- React Query adapter for existing codebases

### Future Considerations
- Offline-first support
- CRDT-based conflict resolution
- Edge-native state replication
- Visual query builder (dev tool)

---

## Anti-Goals

Things we explicitly **won't** do:

1. **GraphQL compatibility** - We're inspired by GraphQL, not compatible with it
2. **REST API generation** - Focus is TypeScript-to-TypeScript, not universal APIs
3. **Database ORM** - We're transport layer, not data layer (use Prisma/Drizzle)
4. **Auth/AuthZ built-in** - Provide hooks, not implementation (use your auth)
5. **React Native first** - Web first, mobile later (but should work via shared client)

---

## Open Questions

1. **Pricing model for commercial support?** - OSS vs dual-license vs enterprise features
2. **Documentation hosting?** - Self-hosted vs Vercel vs Gitbook
3. **Community building strategy?** - Discord vs GitHub Discussions
4. **Integration partnership?** - Vercel/Cloudflare/Supabase sponsorship potential

---

*Last updated: 2024-12-18*
