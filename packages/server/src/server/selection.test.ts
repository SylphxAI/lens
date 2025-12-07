/**
 * @sylphx/lens-server - Selection Tests
 *
 * Tests for field selection and nested input extraction.
 */

import { describe, expect, it } from "bun:test";
import { applySelection, extractNestedInputs } from "./selection.js";

// =============================================================================
// applySelection Tests
// =============================================================================

describe("applySelection", () => {
	it("selects simple fields", () => {
		const data = { id: "1", name: "Alice", email: "alice@example.com", age: 30 };
		const select = { name: true, email: true };

		const result = applySelection(data, select);

		expect(result).toEqual({ id: "1", name: "Alice", email: "alice@example.com" });
	});

	it("always includes id field", () => {
		const data = { id: "1", name: "Alice" };
		const select = { name: true };

		const result = applySelection(data, select);

		expect(result).toEqual({ id: "1", name: "Alice" });
	});

	it("handles nested selection with { select: ... }", () => {
		const data = {
			id: "1",
			name: "Alice",
			profile: { avatar: "url", bio: "Hello" },
		};
		const select = {
			name: true,
			profile: { select: { avatar: true } },
		};

		const result = applySelection(data, select);

		expect(result).toEqual({
			id: "1",
			name: "Alice",
			profile: { avatar: "url" },
		});
	});

	it("handles nested selection with { input: ..., select: ... }", () => {
		const data = {
			id: "1",
			name: "Alice",
			posts: [
				{ id: "p1", title: "Post 1" },
				{ id: "p2", title: "Post 2" },
			],
		};
		const select = {
			name: true,
			posts: {
				input: { limit: 5 }, // input is ignored for selection, used for resolver args
				select: { title: true },
			},
		};

		const result = applySelection(data, select);

		expect(result).toEqual({
			id: "1",
			name: "Alice",
			posts: [
				{ id: "p1", title: "Post 1" },
				{ id: "p2", title: "Post 2" },
			],
		});
	});

	it("handles arrays", () => {
		const data = [
			{ id: "1", name: "Alice", email: "alice@example.com" },
			{ id: "2", name: "Bob", email: "bob@example.com" },
		];
		const select = { name: true };

		const result = applySelection(data, select);

		expect(result).toEqual([
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
		]);
	});

	it("returns null/undefined as-is", () => {
		expect(applySelection(null, { name: true })).toBeNull();
		expect(applySelection(undefined, { name: true })).toBeUndefined();
	});

	it("includes whole field when no nested select", () => {
		const data = {
			id: "1",
			profile: { avatar: "url", bio: "Hello" },
		};
		const select = {
			profile: { input: { size: "large" } }, // input only, no select
		};

		const result = applySelection(data, select);

		expect(result).toEqual({
			id: "1",
			profile: { avatar: "url", bio: "Hello" },
		});
	});
});

// =============================================================================
// extractNestedInputs Tests
// =============================================================================

describe("extractNestedInputs", () => {
	it("extracts input from nested selection", () => {
		const select = {
			name: true,
			posts: {
				input: { limit: 5, published: true },
				select: { title: true },
			},
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(1);
		expect(inputs.get("posts")).toEqual({ limit: 5, published: true });
	});

	it("extracts inputs at multiple levels", () => {
		const select = {
			name: true,
			posts: {
				input: { limit: 5 },
				select: {
					title: true,
					comments: {
						input: { limit: 3 },
						select: { body: true },
					},
				},
			},
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(2);
		expect(inputs.get("posts")).toEqual({ limit: 5 });
		expect(inputs.get("posts.comments")).toEqual({ limit: 3 });
	});

	it("returns empty map when no nested inputs", () => {
		const select = {
			name: true,
			posts: { select: { title: true } },
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(0);
	});

	it("handles deeply nested inputs", () => {
		const select = {
			author: {
				input: { includeDeleted: false },
				select: {
					posts: {
						input: { status: "published" },
						select: {
							comments: {
								input: { limit: 10 },
								select: {
									replies: {
										input: { depth: 2 },
										select: { body: true },
									},
								},
							},
						},
					},
				},
			},
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(4);
		expect(inputs.get("author")).toEqual({ includeDeleted: false });
		expect(inputs.get("author.posts")).toEqual({ status: "published" });
		expect(inputs.get("author.posts.comments")).toEqual({ limit: 10 });
		expect(inputs.get("author.posts.comments.replies")).toEqual({ depth: 2 });
	});

	it("handles mixed selection (some with input, some without)", () => {
		const select = {
			name: true,
			posts: {
				input: { limit: 5 },
				select: { title: true },
			},
			followers: {
				select: { name: true }, // no input
			},
			settings: true, // simple selection
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(1);
		expect(inputs.get("posts")).toEqual({ limit: 5 });
		expect(inputs.has("followers")).toBe(false);
		expect(inputs.has("settings")).toBe(false);
	});

	it("handles input with empty object", () => {
		const select = {
			posts: {
				input: {},
				select: { title: true },
			},
		};

		const inputs = extractNestedInputs(select);

		// Empty input object is still recorded
		expect(inputs.size).toBe(1);
		expect(inputs.get("posts")).toEqual({});
	});

	it("handles selection with input but no select", () => {
		const select = {
			posts: {
				input: { limit: 5 },
			},
		};

		const inputs = extractNestedInputs(select);

		expect(inputs.size).toBe(1);
		expect(inputs.get("posts")).toEqual({ limit: 5 });
	});
});
