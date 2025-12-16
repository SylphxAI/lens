/**
 * Type Safety Tests for Resolver
 *
 * These tests verify compile-time type safety for resolvers:
 * - Missing fields cause TypeScript errors at compile time
 * - Runtime validation throws errors if fields are missing
 *
 * The @ts-expect-error comments verify that TypeScript catches these issues.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { lens } from "../lens.js";
import { id, string } from "../schema/fields.js";
import { model } from "../schema/model.js";

// =============================================================================
// Test Models
// =============================================================================

const User = model("User", {
	id: id(),
	name: string(),
	email: string(),
});

interface TestContext {
	db: { users: Map<string, { id: string; name: string; email: string }> };
}

// =============================================================================
// Type Safety Tests
// =============================================================================

describe("Resolver Type Safety", () => {
	describe("Compile-time type errors for missing fields", () => {
		it("COMPLETE resolver compiles - has all fields", () => {
			const { resolver } = lens<TestContext>();

			// This SHOULD compile - all fields present
			const userResolver = resolver(User, (t) => ({
				id: t.expose("id"),
				name: t.expose("name"),
				email: t.expose("email"),
			}));

			expect(userResolver.entity._name).toBe("User");
			expect(userResolver.hasField("id")).toBe(true);
			expect(userResolver.hasField("name")).toBe(true);
			expect(userResolver.hasField("email")).toBe(true);
		});

		it("INCOMPLETE resolver - missing 'email' field causes compile error", () => {
			const { resolver } = lens<TestContext>();

			// @ts-expect-error - Property 'email' is missing in type
			const createBadResolver = () =>
				resolver(User, (t) => ({
					id: t.expose("id"),
					name: t.expose("name"),
					// email is missing - TypeScript error!
				}));

			// Runtime validation also throws error
			expect(createBadResolver).toThrow(/Missing fields: email/);
		});

		it("INCOMPLETE resolver - missing multiple fields causes compile error", () => {
			const { resolver } = lens<TestContext>();

			// @ts-expect-error - Properties 'name' and 'email' are missing
			const createBadResolver = () =>
				resolver(User, (t) => ({
					id: t.expose("id"),
					// name and email are missing - TypeScript error!
				}));

			// Runtime validation also throws error
			expect(createBadResolver).toThrow(/Missing fields: name, email/);
		});
	});

	describe("Computed fields satisfy type requirements", () => {
		it("plain function computed fields work", () => {
			const { resolver } = lens<TestContext>();

			// Computed fields via plain functions should work
			const userResolver = resolver(User, (t) => ({
				id: t.expose("id"),
				name: t.expose("name"),
				email: ({ source }) => `${source.email}`, // computed
			}));

			expect(userResolver.hasField("email")).toBe(true);
		});

		it("computed fields with args work", () => {
			const { resolver } = lens<TestContext>();

			const userResolver = resolver(User, (t) => ({
				id: t.expose("id"),
				name: t.expose("name"),
				email: t.args(z.object({ upper: z.boolean().default(false) })).resolve(({ source, args }) => {
					return args.upper ? source.email.toUpperCase() : source.email;
				}),
			}));

			expect(userResolver.hasField("email")).toBe(true);
		});
	});
});
