---
"@sylphx/lens-core": patch
"@sylphx/lens-client": patch
---

fix(client): correct mutation detection with eager handshake

Architectural improvement for operation type detection:

1. **Eager handshake**: Connection starts immediately in constructor (non-blocking).
   First operation waits for handshake to complete, then uses server metadata
   to determine operation type. No more pattern matching guesswork.

2. **Deferred execution**: `createAccessor` returns a unified result object that
   defers the query/mutation decision until metadata is available. Both `.then()`
   and `.subscribe()` wait for metadata internally.

3. **InferRouterClient types**: Updated to correctly return:
   - Queries: `QueryResultType<TOutput>` (thenable with `.subscribe()`, `.value`)
   - Mutations: `Promise<MutationResultType<TOutput>>` (with `data` and `rollback`)

4. **Nested metadata lookup**: Fixed `getOperationMeta()` to navigate nested
   operations structure (e.g., `"post.publish"` → `metadata.operations.post.publish`)
