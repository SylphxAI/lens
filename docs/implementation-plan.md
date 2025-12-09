# Model API Implementation Plan

## Overview

Rename `entity()` to `model()` with cleaner API:
- `model()` - Unified definition for entities (with id) and types (without id)
- `nullable()` - Wrapper function for nullable return types
- Auto-track models from router (remove `entities` from createApp)
- Remove Zod from `.returns()` - only models allowed

## Design Decisions

### 1. Model vs Entity
```typescript
// Old API (deprecated)
const User = entity<AppContext>("User").define((t) => ({ ... }));

// New API
const User = model<AppContext>("User", (t) => ({ ... }));

// Inline usage
query().returns(model("Stats", (t) => ({ count: t.int() })));
```

### 2. Nullable Wrapper
```typescript
// Return types
.returns(User)              // User (non-null)
.returns(nullable(User))    // User | null
.returns(list(User))        // User[]
.returns(nullable(list(User))) // User[] | null
```

### 3. ID Determines Behavior
- Model with `t.id()` → Normalizable, cacheable
- Model without `t.id()` → Not normalizable, resolvers still work

### 4. Auto-tracking
```typescript
// Old
createApp({ router, entities: { User, Post } })

// New
createApp({ router }) // Models auto-collected from router
```

## Implementation Steps

### Phase 1: Core Types
1. Add `model()` function in `packages/core/src/schema/model.ts`
2. Add `nullable()` and `list()` wrappers in `packages/core/src/schema/wrappers.ts`
3. Update `ReturnSpec` types in `packages/core/src/operations/types.ts`

### Phase 2: Integration
4. Update query/mutation builders to use new return types
5. Add model auto-tracking utility
6. Update createApp to auto-collect models

### Phase 3: Deprecation
7. Mark `entity()` as deprecated (alias to `model()`)
8. Update all exports

### Phase 4: Documentation
9. Update all README files
10. Update practical-guide.md
11. Add migration guide

## Files to Create/Modify

### New Files
- `packages/core/src/schema/model.ts` - New model() function
- `packages/core/src/schema/wrappers.ts` - nullable(), list() wrappers

### Modified Files
- `packages/core/src/schema/define.ts` - Deprecate entity()
- `packages/core/src/schema/index.ts` - Update exports
- `packages/core/src/operations/types.ts` - Update ReturnSpec
- `packages/server/src/app.ts` - Auto-track models
- All documentation files
