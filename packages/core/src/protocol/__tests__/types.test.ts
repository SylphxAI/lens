/**
 * @sylphx/lens-core - Protocol Types Tests
 */

import { describe, expect, it } from "bun:test";
import type { Message, Op } from "../types.js";
import { isError, isOps, isSnapshot } from "../types.js";

describe("Message type guards", () => {
	describe("isSnapshot", () => {
		it("returns true for snapshot message", () => {
			const msg: Message = { $: "snapshot", data: { id: "1", name: "Alice" } };
			expect(isSnapshot(msg)).toBe(true);
		});

		it("returns false for ops message", () => {
			const msg: Message = { $: "ops", ops: [] };
			expect(isSnapshot(msg)).toBe(false);
		});

		it("returns false for error message", () => {
			const msg: Message = { $: "error", error: "Not found" };
			expect(isSnapshot(msg)).toBe(false);
		});
	});

	describe("isOps", () => {
		it("returns true for ops message", () => {
			const msg: Message = { $: "ops", ops: [{ o: "set", p: "name", v: "Bob" }] };
			expect(isOps(msg)).toBe(true);
		});

		it("returns false for snapshot message", () => {
			const msg: Message = { $: "snapshot", data: {} };
			expect(isOps(msg)).toBe(false);
		});

		it("returns false for error message", () => {
			const msg: Message = { $: "error", error: "Failed" };
			expect(isOps(msg)).toBe(false);
		});
	});

	describe("isError", () => {
		it("returns true for error message", () => {
			const msg: Message = { $: "error", error: "Not found", code: "NOT_FOUND" };
			expect(isError(msg)).toBe(true);
		});

		it("returns true for error message without code", () => {
			const msg: Message = { $: "error", error: "Something went wrong" };
			expect(isError(msg)).toBe(true);
		});

		it("returns false for snapshot message", () => {
			const msg: Message = { $: "snapshot", data: {} };
			expect(isError(msg)).toBe(false);
		});

		it("returns false for ops message", () => {
			const msg: Message = { $: "ops", ops: [] };
			expect(isError(msg)).toBe(false);
		});
	});
});

describe("Message type examples", () => {
	it("snapshot message with typed data", () => {
		interface User {
			id: string;
			name: string;
		}
		const msg: Message<User> = { $: "snapshot", data: { id: "1", name: "Alice" } };
		expect(msg.data.id).toBe("1");
		expect(msg.data.name).toBe("Alice");
	});

	it("ops message with various operations", () => {
		const ops: Op[] = [
			{ o: "set", p: "user.name", v: "Bob" },
			{ o: "del", p: "user.temp" },
			{ o: "merge", p: "user", v: { age: 30 } },
			{ o: "push", p: "items", v: [1, 2, 3] },
			{ o: "splice", p: "items", i: 0, dc: 1 },
			{ o: "arrSetId", p: "users", id: "1", v: { id: "1", name: "Alice" } },
		];
		const msg: Message = { $: "ops", ops };
		expect(isOps(msg)).toBe(true);
		expect(msg.ops.length).toBe(6);
	});

	it("error message with code", () => {
		const msg: Message = { $: "error", error: "User not found", code: "NOT_FOUND" };
		if (isError(msg)) {
			expect(msg.error).toBe("User not found");
			expect(msg.code).toBe("NOT_FOUND");
		}
	});
});
