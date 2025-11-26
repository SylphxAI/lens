/**
 * @sylphx/lens-core - initLens Tests
 *
 * Tests for the tRPC-style initLens pattern.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { entity } from "../schema/define";
import { t } from "../schema/types";
import { initLens } from "./init";

// =============================================================================
// Test Fixtures
// =============================================================================

const User = entity("User", {
	id: t.id(),
	name: t.string(),
	email: t.string(),
});

interface TestContext {
	db: {
		user: {
			find: (id: string) => { id: string; name: string; email: string } | null;
			create: (data: { name: string; email: string }) => { id: string; name: string; email: string };
		};
	};
	user: { id: string; name: string } | null;
}

// =============================================================================
// Test: initLens
// =============================================================================

describe("initLens", () => {
	it("creates a lens instance with typed context", () => {
		const lens = initLens.context<TestContext>().create();

		expect(lens).toBeDefined();
		expect(lens.query).toBeFunction();
		expect(lens.mutation).toBeFunction();
	});

	it("creates query with typed context", () => {
		const lens = initLens.context<TestContext>().create();

		const getUser = lens
			.query()
			.input(z.object({ id: z.string() }))
			.returns(User)
			.resolve(({ input, ctx }) => {
				// ctx should be typed as TestContext
				const user = ctx.db.user.find(input.id);
				return user ?? { id: input.id, name: "Unknown", email: "" };
			});

		expect(getUser._type).toBe("query");
		expect(getUser._input).toBeDefined();
		expect(getUser._output).toBe(User);
	});

	it("creates mutation with typed context", () => {
		const lens = initLens.context<TestContext>().create();

		const createUser = lens
			.mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.resolve(({ input, ctx }) => {
				// ctx should be typed as TestContext
				return ctx.db.user.create(input);
			});

		expect(createUser._type).toBe("mutation");
		expect(createUser._input).toBeDefined();
	});

	it("creates query with name", () => {
		const lens = initLens.context<TestContext>().create();

		const whoami = lens
			.query("whoami")
			.returns(User)
			.resolve(({ ctx }) => {
				if (!ctx.user) return { id: "", name: "Anonymous", email: "" };
				return { id: ctx.user.id, name: ctx.user.name, email: "" };
			});

		expect(whoami._type).toBe("query");
		expect(whoami._name).toBe("whoami");
	});

	it("creates mutation with name", () => {
		const lens = initLens.context<TestContext>().create();

		const signOut = lens
			.mutation("signOut")
			.input(z.object({}))
			.resolve(() => {
				return { success: true };
			});

		expect(signOut._type).toBe("mutation");
		expect(signOut._name).toBe("signOut");
	});

	it("executes resolver with context", async () => {
		const lens = initLens.context<TestContext>().create();

		const getUser = lens
			.query()
			.input(z.object({ id: z.string() }))
			.resolve(({ input, ctx }) => {
				return ctx.db.user.find(input.id);
			});

		const mockCtx: TestContext = {
			db: {
				user: {
					find: (id) => ({ id, name: "John", email: "john@example.com" }),
					create: (data) => ({ id: "new-id", ...data }),
				},
			},
			user: null,
		};

		const result = await getUser._resolve!({
			input: { id: "123" },
			ctx: mockCtx,
		});

		expect(result).toEqual({ id: "123", name: "John", email: "john@example.com" });
	});

	it("mutation can resolve without .returns()", async () => {
		const lens = initLens.context<TestContext>().create();

		const createUser = lens
			.mutation()
			.input(z.object({ name: z.string(), email: z.string() }))
			.resolve(({ input, ctx }) => ctx.db.user.create(input));

		const mockCtx: TestContext = {
			db: {
				user: {
					find: () => null,
					create: (data) => ({ id: "new-id", ...data }),
				},
			},
			user: null,
		};

		const result = await createUser._resolve!({
			input: { name: "Jane", email: "jane@example.com" },
			ctx: mockCtx,
		});

		expect(result).toEqual({ id: "new-id", name: "Jane", email: "jane@example.com" });
	});
});
