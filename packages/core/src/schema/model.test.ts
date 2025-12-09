/**
 * @sylphx/lens-core - Model API Tests
 */

import { describe, expect, it } from "bun:test";
import { model, isModelDef, isNormalizableModel, MODEL_SYMBOL } from "./model.js";
import { t } from "./types.js";

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
});
