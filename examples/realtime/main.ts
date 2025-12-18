/**
 * Lens Real-time Example
 *
 * Shows the key differentiator: EVERY query can be subscribed to.
 * Same query code, client chooses: await (one-shot) or subscribe (live).
 *
 * Run: bun run examples/realtime/main.ts
 */

import { createApp } from "@sylphx/lens-server";
import { createClient, direct } from "@sylphx/lens-client";
import { model, id, string, int, lens, router, list } from "@sylphx/lens-core";
import { z } from "zod";

// =============================================================================
// 1. Models
// =============================================================================

const Counter = model("Counter", {
  id: id(),
  name: string(),
  value: int(),
});

// =============================================================================
// 2. In-memory database
// =============================================================================

type CounterData = { id: string; name: string; value: number };
const counters = new Map<string, CounterData>([
  ["visits", { id: "visits", name: "Page Visits", value: 42 }],
  ["clicks", { id: "clicks", name: "Button Clicks", value: 17 }],
]);

// =============================================================================
// 3. Operations
// =============================================================================

const { query, mutation } = lens<{}>();

const counterRouter = router({
  // Query - supports both one-shot and subscribe
  get: query()
    .args(z.object({ id: z.string() }))
    .returns(Counter)
    .resolve(({ args }) => {
      const counter = counters.get(args.id);
      if (!counter) throw new Error("Counter not found");
      return counter;
    }),

  list: query()
    .returns(list(Counter))
    .resolve(() => Array.from(counters.values())),

  // Mutation - modify data
  increment: mutation()
    .args(z.object({ id: z.string() }))
    .returns(Counter)
    .resolve(({ args }) => {
      const counter = counters.get(args.id);
      if (!counter) throw new Error("Counter not found");
      counter.value += 1;
      return counter;
    }),
});

// =============================================================================
// 4. Create Server & Client
// =============================================================================

const app = createApp({
  router: router({ counter: counterRouter }),
  entities: { Counter },
  context: () => ({}),
});

const client = createClient({ transport: direct({ app }) });

// =============================================================================
// 5. Demo: Different ways to use the SAME query
// =============================================================================

async function main() {
  console.log("=".repeat(60));
  console.log("Lens Real-time Example");
  console.log("=".repeat(60));
  console.log();

  // -------------------------------------------------------------------------
  // Method 1: One-shot query (await)
  // -------------------------------------------------------------------------
  console.log("1️⃣  ONE-SHOT QUERY (await)");
  console.log("-".repeat(40));
  const counter = await client.counter.get({ id: "visits" });
  console.log(`   ${counter.name}: ${counter.value}`);
  console.log();

  // -------------------------------------------------------------------------
  // Method 2: Subscribe for live updates
  // -------------------------------------------------------------------------
  console.log("2️⃣  LIVE SUBSCRIPTION (.subscribe())");
  console.log("-".repeat(40));

  const updates: CounterData[] = [];
  const unsubscribe = client.counter.get({ id: "visits" }).subscribe((data) => {
    updates.push(data);
    console.log(`   [Live] ${data.name}: ${data.value}`);
  });

  // Wait for initial data
  await new Promise((r) => setTimeout(r, 50));
  unsubscribe();
  console.log(`   Received ${updates.length} update(s)`);
  console.log();

  // -------------------------------------------------------------------------
  // Method 3: Select specific fields
  // -------------------------------------------------------------------------
  console.log("3️⃣  FIELD SELECTION (.select())");
  console.log("-".repeat(40));
  const partial = await client.counter.get(
    { id: "clicks" },
    { select: { name: true } }  // Only fetch 'name' field
  );
  console.log(`   Selected: { name: "${partial.name}" }`);
  console.log(`   (value field not fetched - saves bandwidth!)`);
  console.log();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("=".repeat(60));
  console.log("KEY INSIGHT:");
  console.log();
  console.log("  Same query definition, three usage patterns:");
  console.log("    await client.counter.get({ id })           → Promise<Counter>");
  console.log("    client.counter.get({ id }).subscribe(cb)   → live updates");
  console.log("    client.counter.get({ id }, { select })     → partial data");
  console.log();
  console.log("  No separate subscription system needed!");
  console.log("=".repeat(60));
}

main().catch(console.error);
