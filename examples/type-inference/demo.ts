/**
 * Type Inference Demo
 *
 * This example demonstrates the complete type inference chain in Lens:
 *   app._types.router → direct({ app }) → TypedTransport → createClient() → typed client
 *
 * Run: bun run examples/type-inference/demo.ts
 */

import { createApp, optimisticPlugin } from "@sylphx/lens-server";
import { createClient, direct } from "@sylphx/lens-client";
import { model, id, string, boolean, datetime, enumType, nullable, int, json, lens, router, list } from "@sylphx/lens-core";
import { z } from "zod";

// =============================================================================
// 1. Define Models with Full Type Information
// =============================================================================

console.log("📦 Defining models...\n");

const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
	role: enumType(["user", "admin", "moderator"]),
	bio: nullable(string()),
	createdAt: datetime(),
});

const Post = model("Post", {
	id: id(),
	title: string(),
	content: string(),
	published: boolean(),
	authorId: string(),
	viewCount: int(),
	tags: json<string[]>(),
});

const Comment = model("Comment", {
	id: id(),
	text: string(),
	postId: string(),
	authorId: string(),
	likes: int(),
});

// =============================================================================
// 2. Define Context Type
// =============================================================================

interface AppContext {
	db: {
		users: Map<string, { id: string; name: string; email: string; role: "user" | "admin" | "moderator"; createdAt: Date }>;
		posts: Map<string, { id: string; title: string; content: string; published: boolean; authorId: string; viewCount: number; tags: string[] }>;
		comments: Map<string, { id: string; text: string; postId: string; authorId: string; likes: number }>;
	};
	currentUser: { id: string; name: string } | null;
	requestId: string;
}

// =============================================================================
// 3. Create Typed Builders with lens<Context>()
// =============================================================================

console.log("🔧 Creating typed builders with lens<AppContext>()...\n");

const { query, mutation, plugins } = lens<AppContext>().withPlugins([
	optimisticPlugin(),
]);

// =============================================================================
// 4. Define Operations with .returns() for Type Inference
// =============================================================================

console.log("📝 Defining operations...\n");

// User operations
const userRouter = router({
	// Query without input
	whoami: query()
		.returns(User)
		.resolve(({ ctx }) => {
			if (!ctx.currentUser) throw new Error("Not authenticated");
			const user = ctx.db.users.get(ctx.currentUser.id);
			if (!user) throw new Error("User not found");
			return user;
		}),

	// Query with input
	get: query()
		.input(z.object({ id: z.string() }))
		.returns(User)
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error(`User not found: ${input.id}`);
			return user;
		}),

	// Query returning array
	list: query()
		.returns(list(User))
		.resolve(({ ctx }) => Array.from(ctx.db.users.values())),

	// Query with optional parameters
	search: query()
		.input(z.object({
			query: z.string(),
			role: z.enum(["user", "admin", "moderator"]).optional(),
			limit: z.number().default(10),
		}))
		.returns(list(User))
		.resolve(({ input, ctx }) => {
			let results = Array.from(ctx.db.users.values())
				.filter(u => u.name.toLowerCase().includes(input.query.toLowerCase()));

			if (input.role) {
				results = results.filter(u => u.role === input.role);
			}

			return results.slice(0, input.limit);
		}),

	// Mutation with optimistic update
	update: mutation()
		.input(z.object({
			id: z.string(),
			name: z.string().optional(),
			bio: z.string().optional(),
		}))
		.returns(User)
		.optimistic("merge")
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error("User not found");
			const updated = {
				...user,
				...(input.name && { name: input.name }),
			};
			ctx.db.users.set(input.id, updated);
			return updated;
		}),

	// Mutation without .returns() - infers from resolver
	setRole: mutation()
		.input(z.object({ id: z.string(), role: z.enum(["user", "admin", "moderator"]) }))
		.resolve(({ input, ctx }) => {
			const user = ctx.db.users.get(input.id);
			if (!user) throw new Error("User not found");
			ctx.db.users.set(input.id, { ...user, role: input.role });
			return { success: true, userId: input.id, newRole: input.role };
		}),
});

// Post operations
const postRouter = router({
	get: query()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			return post;
		}),

	trending: query()
		.input(z.object({ limit: z.number().default(10) }))
		.returns(list(Post))
		.resolve(({ input, ctx }) =>
			Array.from(ctx.db.posts.values())
				.filter(p => p.published)
				.sort((a, b) => b.viewCount - a.viewCount)
				.slice(0, input.limit)
		),

	create: mutation()
		.input(z.object({ title: z.string(), content: z.string(), tags: z.array(z.string()).default([]) }))
		.returns(Post)
		.optimistic("create")
		.resolve(({ input, ctx }) => {
			const post = {
				id: `post-${Date.now()}`,
				title: input.title,
				content: input.content,
				published: false,
				authorId: ctx.currentUser?.id ?? "anonymous",
				viewCount: 0,
				tags: input.tags,
			};
			ctx.db.posts.set(post.id, post);
			return post;
		}),

	publish: mutation()
		.input(z.object({ id: z.string() }))
		.returns(Post)
		.optimistic({ merge: { published: true } })
		.resolve(({ input, ctx }) => {
			const post = ctx.db.posts.get(input.id);
			if (!post) throw new Error("Post not found");
			const updated = { ...post, published: true };
			ctx.db.posts.set(input.id, updated);
			return updated;
		}),
});

// Comment operations
const commentRouter = router({
	list: query()
		.input(z.object({ postId: z.string() }))
		.returns(list(Comment))
		.resolve(({ input, ctx }) =>
			Array.from(ctx.db.comments.values()).filter(c => c.postId === input.postId)
		),

	add: mutation()
		.input(z.object({ postId: z.string(), text: z.string() }))
		.returns(Comment)
		.optimistic("create")
		.resolve(({ input, ctx }) => {
			const comment = {
				id: `comment-${Date.now()}`,
				text: input.text,
				postId: input.postId,
				authorId: ctx.currentUser?.id ?? "anonymous",
				likes: 0,
			};
			ctx.db.comments.set(comment.id, comment);
			return comment;
		}),

	like: mutation()
		.input(z.object({ id: z.string() }))
		.returns(Comment)
		.resolve(({ input, ctx }) => {
			const comment = ctx.db.comments.get(input.id);
			if (!comment) throw new Error("Comment not found");
			const updated = { ...comment, likes: comment.likes + 1 };
			ctx.db.comments.set(input.id, updated);
			return updated;
		}),
});

// =============================================================================
// 5. Create Router
// =============================================================================

const appRouter = router({
	user: userRouter,
	post: postRouter,
	comment: commentRouter,
});

// =============================================================================
// 6. Create Server
// =============================================================================

console.log("🚀 Creating server...\n");

const app = createApp({
	router: appRouter,
	plugins,
	context: () => ({
		db: {
			users: new Map([
				["1", { id: "1", name: "Alice", email: "alice@example.com", role: "admin" as const, createdAt: new Date() }],
				["2", { id: "2", name: "Bob", email: "bob@example.com", role: "user" as const, createdAt: new Date() }],
				["3", { id: "3", name: "Charlie", email: "charlie@example.com", role: "moderator" as const, createdAt: new Date() }],
			]),
			posts: new Map([
				["1", { id: "1", title: "Hello World", content: "First post!", published: true, authorId: "1", viewCount: 100, tags: ["intro"] }],
				["2", { id: "2", title: "Lens Guide", content: "How to use Lens...", published: true, authorId: "1", viewCount: 250, tags: ["tutorial", "lens"] }],
				["3", { id: "3", title: "Draft Post", content: "Work in progress", published: false, authorId: "2", viewCount: 0, tags: [] }],
			]),
			comments: new Map([
				["1", { id: "1", text: "Great post!", postId: "1", authorId: "2", likes: 5 }],
				["2", { id: "2", text: "Very helpful", postId: "2", authorId: "3", likes: 3 }],
			]),
		},
		currentUser: { id: "1", name: "Alice" },
		requestId: crypto.randomUUID(),
	}),
});

// =============================================================================
// 7. Create Client with Full Type Inference
// =============================================================================

console.log("📱 Creating client with direct transport...\n");

// The magic: client is FULLY TYPED from server!
// No manual type annotations needed.
const client = createClient({
	transport: direct({ app }),
});

// =============================================================================
// 8. Demonstrate Type Inference
// =============================================================================

async function demonstrateTypeInference() {
	console.log("=".repeat(60));
	console.log("🔍 Type Inference Demonstration");
	console.log("=".repeat(60));
	console.log();

	// Example 1: Query with entity return type
	console.log("1️⃣ Query with .returns(User)");
	console.log("-".repeat(40));
	const user = await client.user.get({ id: "1" });

	// These are all correctly typed!
	const name: string = user.name;
	const email: string = user.email;
	const role: "user" | "admin" | "moderator" = user.role;
	const bio: string | undefined = user.bio;
	const createdAt: Date = user.createdAt;

	console.log(`  name: ${name} (type: string)`);
	console.log(`  email: ${email} (type: string)`);
	console.log(`  role: ${role} (type: "user" | "admin" | "moderator")`);
	console.log(`  bio: ${bio} (type: string | undefined)`);
	console.log(`  createdAt: ${createdAt.toISOString()} (type: Date)`);
	console.log();

	// Example 2: Query returning array
	console.log("2️⃣ Query with .returns(list(User))");
	console.log("-".repeat(40));
	const users = await client.user.list();

	// users is User[]
	console.log(`  users.length: ${users.length}`);
	console.log(`  users[0].name: ${users[0].name}`);
	console.log(`  Type: User[]`);
	console.log();

	// Example 3: Query with complex input
	console.log("3️⃣ Query with complex input schema");
	console.log("-".repeat(40));
	const searchResults = await client.user.search({
		query: "a",
		role: "admin",  // TypeScript knows this must be "user" | "admin" | "moderator"
		limit: 5,
	});
	console.log(`  Found ${searchResults.length} users matching 'a' with role 'admin'`);
	console.log();

	// Example 4: Mutation with optimistic update
	console.log("4️⃣ Mutation with .optimistic('merge')");
	console.log("-".repeat(40));
	const updateResult = await client.user.update({
		id: "1",
		name: "Alice Updated",
	});

	// result.data is User type
	const updatedUser = updateResult.data!;
	console.log(`  Updated name: ${updatedUser.name}`);
	console.log(`  Has rollback: ${typeof updateResult.rollback === "function"}`);
	console.log();

	// Example 5: Mutation without .returns() - returns raw data
	console.log("5️⃣ Mutation without .returns()");
	console.log("-".repeat(40));
	const setRoleResult = await client.user.setRole({
		id: "2",
		role: "moderator",
	});

	// Without .returns(), result is the resolved value directly
	console.log(`  result: ${JSON.stringify(setRoleResult)}`);
	console.log();

	// Example 6: Different entity types have different shapes
	console.log("6️⃣ Different models have different types");
	console.log("-".repeat(40));

	const post = await client.post.get({ id: "1" });
	// Post has different fields than User
	const title: string = post.title;
	const published: boolean = post.published;
	const viewCount: number = post.viewCount;
	const tags: string[] = post.tags;

	console.log(`  Post title: ${title} (type: string)`);
	console.log(`  Post published: ${published} (type: boolean)`);
	console.log(`  Post viewCount: ${viewCount} (type: number)`);
	console.log(`  Post tags: [${tags.join(", ")}] (type: string[])`);
	console.log();

	// Example 7: Nested router paths
	console.log("7️⃣ Nested router paths");
	console.log("-".repeat(40));
	const comments = await client.comment.list({ postId: "1" });
	console.log(`  Found ${comments.length} comments`);
	if (comments.length > 0) {
		const comment = comments[0];
		console.log(`  First comment: "${comment.text}" (${comment.likes} likes)`);
	}
	console.log();

	// Example 8: Create operations
	console.log("8️⃣ Create mutation with .optimistic('create')");
	console.log("-".repeat(40));
	const newPost = await client.post.create({
		title: "New Post from Demo",
		content: "This was created with full type safety!",
		tags: ["demo", "type-inference"],
	});
	console.log(`  Created post: ${newPost.data!.title}`);
	console.log(`  Post ID: ${newPost.data!.id}`);
	console.log();

	console.log("=".repeat(60));
	console.log("✅ All operations completed with full type inference!");
	console.log("=".repeat(60));
}

// Run the demo
demonstrateTypeInference().catch(console.error);
