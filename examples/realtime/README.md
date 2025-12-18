# Lens Real-time Example

Demonstrates Lens's key differentiator: **every query is automatically subscribable**.

## Run It

```bash
cd examples/realtime
bun install
bun start
```

## Key Concept

Same query definition, three usage patterns:

```typescript
// Define once
const get = query()
  .args(z.object({ id: z.string() }))
  .returns(Counter)
  .resolve(({ args }) => db.get(args.id));

// Use three ways:

// 1. One-shot (await)
const counter = await client.counter.get({ id: "visits" });

// 2. Live updates (subscribe)
client.counter.get({ id: "visits" }).subscribe((counter) => {
  console.log("Updated:", counter.value);
});

// 3. Field selection (partial data)
const partial = await client.counter.get(
  { id: "visits" },
  { select: { name: true } }
);
```

## Why This Matters

| Traditional Approach | Lens Approach |
|---------------------|---------------|
| Separate REST endpoint | Same query |
| Separate WebSocket subscription | Same query |
| Manual cache invalidation | Automatic |
| Different code paths | One definition |

## Output

```
1️⃣  ONE-SHOT QUERY (await)
   Page Visits: 42

2️⃣  LIVE SUBSCRIPTION (.subscribe())
   [Live] Page Visits: 42

3️⃣  FIELD SELECTION (.select())
   Selected: { name: "Button Clicks" }
```

## Next Steps

- Add `.subscribe()` to your queries for server-pushed updates
- Use WebSocket transport for production: `ws({ url: 'ws://...' })`
- See `examples/v2-complete/` for full Publisher pattern with database watchers
