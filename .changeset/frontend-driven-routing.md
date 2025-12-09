---
"@sylphx/lens-server": minor
"@sylphx/lens-client": minor
---

feat: frontend-driven transport routing with entity metadata

Server changes:
- Add entity field metadata (FieldMode: exposed/resolve/subscribe) to getMetadata()
- Add returnType to OperationMeta for client-side entity identification
- Deprecate hasAnySubscription/requiresStreamingTransport (now client-side)

Client changes:
- Add hasAnySubscription() helper using entity metadata from server
- Add getEffectiveOperationType() for determining actual operation type
- Client now routes queries with subscription fields to streaming transport
