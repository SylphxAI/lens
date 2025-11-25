---
"@sylphx/lens-core": minor
"@sylphx/lens-server": minor
---

Switch to tRPC-style ctx parameter pattern

Resolver functions now receive `ctx` directly as a parameter instead of using `useContext()`:

```typescript
// Before
export const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input }) => {
    const db = useContext<AppContext>().db;
    return db.user.findUnique({ where: { id: input.id } });
  });

// After
export const getUser = query()
  .input(z.object({ id: z.string() }))
  .returns(User)
  .resolve(({ input, ctx }) => {
    return ctx.db.user.findUnique({ where: { id: input.id } });
  });
```

This improves developer experience with automatic type inference - no more manual type annotations on every useContext call.

**Removed exports:**
- `useContext` - use `ctx` parameter instead
- `tryUseContext` - use `ctx` parameter instead
- `createComposable` - use `ctx.propertyName` instead
- `createComposables` - use `ctx.propertyName` instead
- `hasContext` - internal use only
- `extendContext` - internal use only
