/**
 * Lens Hello World
 *
 * The simplest possible Lens app: ~60 lines, runs in 30 seconds.
 *
 * Run: bun run examples/hello-world/main.ts
 */

import { createApp } from "@sylphx/lens-server";
import { createClient, direct } from "@sylphx/lens-client";
import { model, id, string, boolean, lens, router, list } from "@sylphx/lens-core";
import { z } from "zod";

// 1. Define a model (your data shape)
const Todo = model("Todo", {
  id: id(),
  title: string(),
  done: boolean(),
});

// 2. In-memory database
const db = {
  todos: new Map<string, { id: string; title: string; done: boolean }>(),
};

// 3. Create typed builders
const { query, mutation } = lens<{ todos: typeof db.todos }>();

// 4. Define operations
const todoRouter = router({
  list: query()
    .returns(list(Todo))
    .resolve(({ ctx }) => Array.from(ctx.todos.values())),

  add: mutation()
    .args(z.object({ title: z.string() }))
    .returns(Todo)
    .resolve(({ args, ctx }) => {
      const todo = { id: crypto.randomUUID(), title: args.title, done: false };
      ctx.todos.set(todo.id, todo);
      return todo;
    }),

  toggle: mutation()
    .args(z.object({ id: z.string() }))
    .returns(Todo)
    .resolve(({ args, ctx }) => {
      const todo = ctx.todos.get(args.id)!;
      todo.done = !todo.done;
      return todo;
    }),
});

// 5. Create server
const app = createApp({
  router: router({ todo: todoRouter }),
  entities: { Todo },
  context: () => ({ todos: db.todos }),
});

// 6. Create client (direct = in-process, no HTTP needed)
const client = createClient({ transport: direct({ app }) });

// 7. Use it!
async function main() {
  console.log("Adding todos...");
  await client.todo.add({ title: "Learn Lens" });
  await client.todo.add({ title: "Build something cool" });

  console.log("Toggling first todo...");
  const todos = await client.todo.list();
  await client.todo.toggle({ id: todos[0].id });

  console.log("\nAll todos:");
  const final = await client.todo.list();
  for (const todo of final) {
    const status = todo.done ? "✓" : "○";
    console.log(`  ${status} ${todo.title}`);
  }
}

main();
