/**
 * @sylphx/lens-core - Model API Tests
 */

import { describe, expect, it } from "bun:test";
import { isModelDef, isNormalizableModel, MODEL_SYMBOL, model } from "./model.js";
import { hasFieldResolvers, hasFieldSubscribers } from "./model-resolvers.js";

describe("model()", () => {
	describe("basic definition", () => {
		it("creates a model with name and fields", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
				email: t.string(),
			}));

			expect(User._name).toBe("User");
			expect(User.fields.id).toBeDefined();
			expect(User.fields.name).toBeDefined();
			expect(User.fields.email).toBeDefined();
			expect(MODEL_SYMBOL in User).toBe(true);
		});

		it("detects model with id as normalizable", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
			}));

			expect(User._hasId).toBe(true);
			expect(isNormalizableModel(User)).toBe(true);
		});

		it("detects model without id as non-normalizable", () => {
			const Stats = model("Stats", (t) => ({
				totalUsers: t.int(),
				averageAge: t.float(),
			}));

			expect(Stats._hasId).toBe(false);
			expect(isNormalizableModel(Stats)).toBe(false);
		});
	});

	describe("typed context", () => {
		interface AppContext {
			db: { users: { count: () => number } };
		}

		it("supports typed context via factory", () => {
			const typedModel = model<AppContext>();

			const Stats = typedModel("Stats", (t) => ({
				totalUsers: t.int().resolve(({ ctx }) => ctx.db.users.count()),
			}));

			expect(Stats._name).toBe("Stats");
			expect(Stats.fields.totalUsers).toBeDefined();
		});

		it("supports typed context via builder class", () => {
			const User = model<AppContext>("User").define((t) => ({
				id: t.id(),
				name: t.string(),
			}));

			expect(User._name).toBe("User");
			expect(User.fields.id).toBeDefined();
		});
	});

	describe("inline definition", () => {
		it("supports inline model definition without context", () => {
			const Result = model("Result", (t) => ({
				count: t.int(),
				success: t.boolean(),
			}));

			expect(Result._name).toBe("Result");
			expect(Result.fields.count).toBeDefined();
			expect(Result.fields.success).toBeDefined();
		});
	});

	describe("isModelDef()", () => {
		it("returns true for ModelDef", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
			}));

			expect(isModelDef(User)).toBe(true);
		});

		it("returns false for non-ModelDef values", () => {
			expect(isModelDef(null)).toBe(false);
			expect(isModelDef(undefined)).toBe(false);
			expect(isModelDef({})).toBe(false);
			expect(isModelDef({ _name: "User" })).toBe(false);
		});
	});

	describe("relations", () => {
		it("supports lazy relations", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
				posts: t.many(() => Post),
			}));

			const Post = model("Post", (t) => ({
				id: t.id(),
				title: t.string(),
				author: t.one(() => User),
			}));

			expect(User.fields.posts).toBeDefined();
			expect(Post.fields.author).toBeDefined();
		});
	});

	describe("optional fields", () => {
		it("supports optional fields", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
				bio: t.string().optional(),
			}));

			expect(User.fields.bio._optional).toBe(true);
		});
	});

	describe("StandardEntity protocol", () => {
		it("implements StandardEntity protocol", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
			}));

			// StandardEntity marker
			expect("~entity" in User).toBe(true);
			expect((User as any)["~entity"].name).toBe("User");
		});
	});

	describe(".resolve() chain method", () => {
		interface AppContext {
			db: { posts: { filter: (fn: (p: { authorId: string }) => boolean) => unknown[] } };
		}

		it("adds field resolvers via .resolve()", () => {
			const Post = model("Post", (t) => ({
				id: t.id(),
				title: t.string(),
			}));

			const User = model<AppContext>("User", (t) => ({
				id: t.id(),
				name: t.string(),
				posts: t.many(() => Post),
			})).resolve({
				posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
			});

			expect(User._name).toBe("User");
			expect(hasFieldResolvers(User)).toBe(true);
			expect(User._fieldResolvers).toBeDefined();
			expect(User._fieldResolvers.posts).toBeDefined();
		});

		it("source and parent both work", () => {
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
			})).resolve({
				// Both source and parent should be available
				name: ({ source, parent }) => {
					expect(source).toBe(parent);
					return source.name;
				},
			});

			expect(hasFieldResolvers(User)).toBe(true);
		});
	});

	describe(".subscribe() chain method", () => {
		interface AppContext {
			events: { on: (event: string, cb: (value: unknown) => void) => () => void };
		}

		it("adds field subscribers via .subscribe()", () => {
			const User = model<AppContext>("User", (t) => ({
				id: t.id(),
				name: t.string(),
			})).subscribe({
				name:
					({ source, ctx }) =>
					({ emit, onCleanup }) => {
						const unsub = ctx.events.on(`user:${source.id}:name`, emit);
						onCleanup(unsub);
					},
			});

			expect(User._name).toBe("User");
			expect(hasFieldSubscribers(User)).toBe(true);
			expect(User._fieldSubscribers).toBeDefined();
			expect(User._fieldSubscribers.name).toBeDefined();
		});
	});

	describe(".resolve().subscribe() chain", () => {
		interface AppContext {
			db: { posts: { filter: (fn: (p: { authorId: string }) => boolean) => unknown[] } };
			events: { on: (event: string, cb: (value: unknown) => void) => () => void };
		}

		it("supports chaining .resolve() then .subscribe()", () => {
			const Post = model("Post", (t) => ({
				id: t.id(),
				title: t.string(),
			}));

			const User = model<AppContext>("User", (t) => ({
				id: t.id(),
				name: t.string(),
				posts: t.many(() => Post),
			}))
				.resolve({
					posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
				})
				.subscribe({
					name:
						({ source, ctx }) =>
						({ emit, onCleanup }) => {
							const unsub = ctx.events.on(`user:${source.id}:name`, emit);
							onCleanup(unsub);
						},
				});

			expect(User._name).toBe("User");
			expect(hasFieldResolvers(User)).toBe(true);
			expect(hasFieldSubscribers(User)).toBe(true);
			expect(User._fieldResolvers.posts).toBeDefined();
			expect(User._fieldSubscribers.name).toBeDefined();
		});

		it("supports chaining .subscribe() then .resolve()", () => {
			const Post = model("Post", (t) => ({
				id: t.id(),
				title: t.string(),
			}));

			const User = model<AppContext>("User", (t) => ({
				id: t.id(),
				name: t.string(),
				posts: t.many(() => Post),
			}))
				.subscribe({
					name:
						({ source, ctx }) =>
						({ emit, onCleanup }) => {
							const unsub = ctx.events.on(`user:${source.id}:name`, emit);
							onCleanup(unsub);
						},
				})
				.resolve({
					posts: ({ source, ctx }) => ctx.db.posts.filter((p) => p.authorId === source.id),
				});

			expect(User._name).toBe("User");
			expect(hasFieldResolvers(User)).toBe(true);
			expect(hasFieldSubscribers(User)).toBe(true);
		});
	});

	describe("type safety", () => {
		it("correctly infers source type from scalar fields", () => {
			// This is a compile-time test - if this compiles, source types are inferred
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
				age: t.int(),
			})).resolve({
				// source should be inferred as { id: string; name: string; age: number }
				name: ({ source }) => {
					// These should compile - accessing scalar fields
					const _id: string = source.id;
					const _name: string = source.name;
					const _age: number = source.age;
					return `${_id}:${_name}:${_age}`;
				},
			});

			expect(User._name).toBe("User");
		});

		it("resolver return type is checked against field type", () => {
			// This test verifies the type system catches return type mismatches
			// The resolver for 'name' (StringType) should return string
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
			})).resolve({
				// Return type should be string - this compiles because we return string
				name: ({ source }) => source.name.toUpperCase(),
			});

			expect(hasFieldResolvers(User)).toBe(true);
		});

		it("subscriber return type is checked against field type", () => {
			interface AppContext {
				events: { on: (event: string, cb: (value: string) => void) => () => void };
			}

			const User = model<AppContext>("User", (t) => ({
				id: t.id(),
				name: t.string(),
			})).subscribe({
				// Subscriber for string field should emit strings
				name:
					({ source, ctx }) =>
					({ emit, onCleanup }) => {
						// emit should accept string (the field type)
						const unsub = ctx.events.on(`user:${source.id}:name`, emit);
						onCleanup(unsub);
					},
			});

			expect(hasFieldSubscribers(User)).toBe(true);
		});

		it("relation resolver infers return type from target model", () => {
			// Define Post model
			const Post = model("Post", (t) => ({
				id: t.id(),
				title: t.string(),
				content: t.string(),
			}));

			// User with posts relation
			const User = model("User", (t) => ({
				id: t.id(),
				name: t.string(),
				posts: t.many(() => Post),
			})).resolve({
				// Return type should be inferred as Array<{ id: string; title: string; content: string }>
				posts: ({ source }) => {
					// Use source to verify type inference
					void source.id;
					// This should compile - we return the correct shape
					return [
						{ id: "1", title: "Hello", content: "World" },
						{ id: "2", title: "Foo", content: "Bar" },
					];
				},
			});

			expect(hasFieldResolvers(User)).toBe(true);
			expect(User._fieldResolvers.posts).toBeDefined();
		});
	});
});
