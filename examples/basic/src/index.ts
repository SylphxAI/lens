/**
 * Basic Lens Example - Interactive Demo
 *
 * Run: bun run dev
 *
 * This starts the server and runs example queries/mutations.
 */

import { app, db } from "./server.js";
import { createClient, direct } from "@sylphx/lens-client";

// Create client using direct transport (in-process)
const client = createClient({ transport: direct({ app }) });

async function main() {
  console.log("=".repeat(60));
  console.log("Lens Basic Example");
  console.log("=".repeat(60));
  console.log();

  // List initial users
  console.log("📋 Initial users:");
  const users = await client.user.list();
  for (const user of users) {
    console.log(`  - ${user.name} (${user.email})`);
  }
  console.log();

  // Create a new user (optimistic mutations return { data, rollback })
  console.log("➕ Creating new user...");
  const createUserResult = await client.user.create({
    name: "Charlie",
    email: "charlie@example.com",
  });
  const newUser = createUserResult.data;
  console.log(`  Created: ${newUser.name} (id: ${newUser.id})`);
  console.log();

  // List posts
  console.log("📋 Posts:");
  const posts = await client.post.list();
  for (const post of posts) {
    const status = post.published ? "✓" : "○";
    console.log(`  ${status} ${post.title}`);
  }
  console.log();

  // Create and publish a post
  console.log("➕ Creating new post...");
  const createPostResult = await client.post.create({
    title: "My New Post",
    content: "Hello from Lens!",
    authorId: newUser.id,
  });
  const newPost = createPostResult.data;
  console.log(`  Created: "${newPost.title}" (draft)`);

  console.log("📤 Publishing post...");
  const publishResult = await client.post.publish({ id: newPost.id });
  const published = publishResult.data;
  console.log(`  Published: "${published.title}"`);
  console.log();

  // Final state
  console.log("📋 Final posts:");
  const finalPosts = await client.post.list();
  for (const post of finalPosts) {
    const status = post.published ? "✓" : "○";
    console.log(`  ${status} ${post.title}`);
  }
  console.log();

  console.log("=".repeat(60));
  console.log("Done! Run 'bun test' to see more examples.");
  console.log("=".repeat(60));
}

main().catch(console.error);
