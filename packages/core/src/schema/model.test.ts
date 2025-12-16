/**
 * @sylphx/lens-core - Model API Tests
 *
 * v3.0 - Plain object model definitions only.
 */

import { describe, expect, it } from "bun:test";
import {
	bigint,
	boolean,
	bytes,
	datetime,
	decimal,
	enumType,
	float,
	id,
	int,
	isListDef,
	isNullableDef,
	json,
	list,
	nullable,
	object,
	string,
	timestamp,
} from "./fields.js";
import { isModelDef, isNormalizableModel, MODEL_SYMBOL, model } from "./model.js";
import { hasFieldResolvers, hasFieldSubscribers } from "./model-resolvers.js";

describe("model()", () => {
	describe("basic definition", () => {
		it("creates a model with name and fields", () => {
			const User = model("User", {
				id: id(),
				name: string(),
				email: string(),
			});

			expect(User._name).toBe("User");
			expect(User.fields.id).toBeDefined();
			expect(User.fields.name).toBeDefined();
			expect(User.fields.email).toBeDefined();
			expect(MODEL_SYMBOL in User).toBe(true);
		});

		it("detects model with id as normalizable", () => {
			const User = model("User", {
				id: id(),
				name: string(),
			});

			expect(User._hasId).toBe(true);
			expect(isNormalizableModel(User)).toBe(true);
		});

		it("detects model without id as non-normalizable", () => {
			const Stats = model("Stats", {
				totalUsers: int(),
				averageAge: float(),
			});

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

			const User = typedModel("User", {
				id: id(),
				name: string(),
			});

			expect(User._name).toBe("User");
			expect(User.fields.id).toBeDefined();
		});
	});

	describe("isModelDef()", () => {
		it("returns true for ModelDef", () => {
			const User = model("User", {
				id: id(),
				name: string(),
			});

			expect(isModelDef(User)).toBe(true);
		});

		it("returns false for non-ModelDef values", () => {
			expect(isModelDef(null)).toBe(false);
			expect(isModelDef(undefined)).toBe(false);
			expect(isModelDef({})).toBe(false);
			expect(isModelDef({ _name: "User" })).toBe(false);
		});
	});

	describe("StandardEntity protocol", () => {
		it("implements StandardEntity protocol", () => {
			const User = model("User", {
				id: id(),
				name: string(),
			});

			// StandardEntity marker
			expect("~entity" in User).toBe(true);
			expect((User as any)["~entity"].name).toBe("User");
		});
	});

	describe("error handling", () => {
		it("throws error when called without fields", () => {
			expect(() => {
				// @ts-expect-error - intentionally missing fields
				model("User");
			}).toThrow('model("User") requires fields');
		});
	});
});

// =============================================================================
// Plain Object API Tests
// =============================================================================

describe("model() with plain object definition", () => {
	describe("scalar fields", () => {
		it("creates a model with scalar fields", () => {
			const User = model("User", {
				id: id(),
				name: string(),
				age: int(),
				score: float(),
				active: boolean(),
			});

			expect(User._name).toBe("User");
			expect(User.fields.id).toBeDefined();
			expect(User.fields.name).toBeDefined();
			expect(User.fields.age).toBeDefined();
			expect(User.fields.score).toBeDefined();
			expect(User.fields.active).toBeDefined();
			expect(User._hasId).toBe(true);
		});

		it("supports all scalar types", () => {
			const AllScalars = model("AllScalars", {
				id: id(),
				str: string(),
				num: int(),
				flt: float(),
				bool: boolean(),
				dt: datetime(),
				ts: timestamp(),
				dec: decimal(),
				big: bigint(),
				bin: bytes(),
				data: json(),
				status: enumType(["active", "inactive", "pending"] as const),
				meta: object<{ key: string }>(),
			});

			expect(AllScalars._name).toBe("AllScalars");
			expect(Object.keys(AllScalars.fields)).toHaveLength(13);
		});
	});

	describe("list fields", () => {
		it("creates list of scalars", () => {
			const Tags = model("Tags", {
				id: id(),
				tags: list(string()),
				scores: list(int()),
			});

			expect(Tags._name).toBe("Tags");
			expect(Tags.fields.tags).toBeDefined();
			expect(Tags.fields.scores).toBeDefined();
		});

		it("list helper creates ListDef", () => {
			const listDef = list(string());
			expect(isListDef(listDef)).toBe(true);
		});
	});

	describe("nullable fields", () => {
		it("creates nullable scalars", () => {
			const Profile = model("Profile", {
				id: id(),
				bio: nullable(string()),
				avatar: nullable(string()),
			});

			expect(Profile._name).toBe("Profile");
			expect(Profile.fields.bio).toBeDefined();
			expect(Profile.fields.avatar).toBeDefined();
		});

		it("nullable helper creates NullableDef", () => {
			const nullableDef = nullable(string());
			expect(isNullableDef(nullableDef)).toBe(true);
		});

		it("supports nullable list", () => {
			const User = model("User", {
				id: id(),
				tags: nullable(list(string())),
			});

			expect(User._name).toBe("User");
			expect(User.fields.tags).toBeDefined();
		});
	});

	describe("model references", () => {
		it("supports direct model reference", () => {
			const Profile = model("Profile", {
				id: id(),
				bio: string(),
			});

			const User = model("User", {
				id: id(),
				name: string(),
				profile: Profile,
			});

			expect(User._name).toBe("User");
			expect(User.fields.profile).toBeDefined();
		});

		it("supports lazy model reference (for circular deps)", () => {
			// Define Post first (will reference User)
			const Post = model("Post", {
				id: id(),
				title: string(),
				author: () => User, // lazy reference
			});

			// Define User (references Post)
			const User = model("User", {
				id: id(),
				name: string(),
				posts: list(() => Post), // lazy reference
			});

			expect(Post._name).toBe("Post");
			expect(User._name).toBe("User");
			expect(Post.fields.author).toBeDefined();
			expect(User.fields.posts).toBeDefined();
		});

		it("supports list of model references", () => {
			const Comment = model("Comment", {
				id: id(),
				text: string(),
			});

			const Post = model("Post", {
				id: id(),
				title: string(),
				comments: list(Comment),
			});

			expect(Post._name).toBe("Post");
			expect(Post.fields.comments).toBeDefined();
		});

		it("supports nullable model reference", () => {
			const Profile = model("Profile", {
				id: id(),
				bio: string(),
			});

			const User = model("User", {
				id: id(),
				name: string(),
				profile: nullable(Profile),
			});

			expect(User._name).toBe("User");
			expect(User.fields.profile).toBeDefined();
		});
	});

	describe("chain methods", () => {
		it("supports .resolve() chain", () => {
			const Post = model("Post", {
				id: id(),
				title: string(),
			});

			const User = model("User", {
				id: id(),
				name: string(),
				posts: list(() => Post),
			}).resolve({
				posts: ({ source }) => {
					void source.id; // Access source
					return [];
				},
			});

			expect(User._name).toBe("User");
			expect(hasFieldResolvers(User)).toBe(true);
		});

		it("supports .subscribe() chain", () => {
			const User = model("User", {
				id: id(),
				name: string(),
			}).subscribe({
				name:
					({ source }) =>
					({ emit, onCleanup }) => {
						void source.id;
						emit("test");
						onCleanup(() => {});
					},
			});

			expect(User._name).toBe("User");
			expect(hasFieldSubscribers(User)).toBe(true);
		});

		it("supports .resolve().subscribe() chain", () => {
			const Post = model("Post", {
				id: id(),
				title: string(),
			});

			const User = model("User", {
				id: id(),
				name: string(),
				posts: list(() => Post),
			})
				.resolve({
					posts: ({ source }) => {
						void source.id;
						return [];
					},
				})
				.subscribe({
					name:
						({ source }) =>
						({ emit, onCleanup }) => {
							void source.id;
							emit("test");
							onCleanup(() => {});
						},
				});

			expect(User._name).toBe("User");
			expect(hasFieldResolvers(User)).toBe(true);
			expect(hasFieldSubscribers(User)).toBe(true);
		});
	});

	describe("type guards", () => {
		it("isModelDef returns true for plain object models", () => {
			const User = model("User", {
				id: id(),
				name: string(),
			});

			expect(isModelDef(User)).toBe(true);
		});

		it("isNormalizableModel works with plain object models", () => {
			const WithId = model("WithId", {
				id: id(),
				name: string(),
			});

			const WithoutId = model("WithoutId", {
				count: int(),
				total: float(),
			});

			expect(isNormalizableModel(WithId)).toBe(true);
			expect(isNormalizableModel(WithoutId)).toBe(false);
		});
	});
});
