# Lens Hello World

The simplest possible Lens app. **~60 lines. Runs in 30 seconds.**

## Run It

```bash
cd examples/hello-world
bun install
bun start
```

## What It Shows

1. **Model** - Define your data shape with `model()`
2. **Query** - Read data with `query().resolve()`
3. **Mutation** - Write data with `mutation().args().resolve()`
4. **Client** - Call your API with full type safety

## Output

```
Adding todos...
Toggling first todo...

All todos:
  ✓ Learn Lens
  ○ Build something cool
```

## Next Steps

- **Add real-time**: Change `await client.todo.list()` to `client.todo.list().subscribe()`
- **Add HTTP**: Replace `direct({ app })` with `http({ url: '/api' })`
- **See more**: Check `examples/v2-complete/` for relations, field selection, optimistic updates
