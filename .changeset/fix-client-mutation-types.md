---
"@sylphx/lens-core": patch
"@sylphx/lens-client": patch
---

fix(client): correct mutation detection and type inference

Three fixes for client-side mutation handling:

1. **InferRouterClient type mismatch**: Updated `InferRouterClient` in core to correctly type:
   - Queries return `QueryResultType<TOutput>` (thenable with reactive features)
   - Mutations return `Promise<MutationResultType<TOutput>>` (with `data` and optional `rollback`)

2. **Nested metadata lookup**: Fixed `getOperationMeta()` to navigate nested operations structure
   (e.g., `"post.publish"` → `metadata.operations.post.publish`)

3. **Mutation path detection**: Changed from mutation pattern matching to query pattern matching.
   Query patterns are more predictable (`get`, `list`, `find`, `by*`, `search`, etc.), so we
   detect queries and default to mutation for everything else. This correctly handles custom
   mutations like `publish`, `archive`, `enable`, etc.
