---
"@sylphx/lens-client": minor
---

Cleaner transport API with composition-first design:

**Atomic Transports (for composition):**
- `http()` - HTTP POST for query/mutation
- `sse()` - Pure SSE for subscriptions only (NEW)
- `ws()` - WebSocket for all operations

**Bundled Transports (convenience):**
- `httpSse()` - HTTP + SSE combined (the old `sse()` behavior, renamed for clarity)

**Breaking Change:**
- `sse()` now refers to pure SSE transport (subscriptions only)
- Old `sse()` users should migrate to `httpSse()`
- `sseLegacy` alias available for backward compatibility

**Usage:**
```typescript
// Simple (bundled transport)
createClient({ transport: httpSse({ url: '/api' }) })

// Flexible (composition)
createClient({
  transport: routeByType({
    default: http({ url: '/api' }),
    subscription: sse({ url: '/api/events' }),
  }),
})
```
