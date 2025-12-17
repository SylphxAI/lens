/**
 * @sylphx/lens-core - Subscription Tests
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { id, string } from "../schema/fields.js";
import { model } from "../schema/model.js";
import { isSubscriptionDef, subscription } from "./subscription.js";

// Test model
const Post = model("Post", {
	id: id(),
	title: string(),
	authorId: string(),
});

describe("subscription()", () => {
	it("creates a basic subscription", () => {
		const onPostCreated = subscription()
			.returns(Post)
			.subscribe(({ ctx: _ctx }) => ({ emit, onCleanup }) => {
				// Mock subscription
				const handle = setInterval(() => {
					emit({ id: "1", title: "Test", authorId: "user1" });
				}, 1000);
				onCleanup(() => clearInterval(handle));
			});

		expect(onPostCreated._type).toBe("subscription");
		expect(onPostCreated._output).toBe(Post);
		expect(typeof onPostCreated._subscriber).toBe("function");
	});

	it("creates a subscription with args", () => {
		const onPostCreated = subscription()
			.args(z.object({ authorId: z.string().optional() }))
			.returns(Post)
			.subscribe(({ args, ctx: _ctx }) => ({ emit, onCleanup }) => {
				// Use args for filtering
				const handle = setInterval(() => {
					if (!args.authorId || Math.random() > 0.5) {
						emit({ id: "1", title: "Test", authorId: args.authorId || "user1" });
					}
				}, 1000);
				onCleanup(() => clearInterval(handle));
			});

		expect(onPostCreated._type).toBe("subscription");
		expect(onPostCreated._input).toBeDefined();
		expect(onPostCreated._output).toBe(Post);
	});

	it("creates a subscription with name", () => {
		const onPostCreated = subscription("onPostCreated")
			.returns(Post)
			.subscribe(({ ctx: _ctx }) => ({ emit: _emit, onCleanup }) => {
				onCleanup(() => {});
			});

		expect(onPostCreated._name).toBe("onPostCreated");
	});

	it("type guard works correctly", () => {
		const onPostCreated = subscription()
			.returns(Post)
			.subscribe(({ ctx: _ctx }) => ({ emit: _emit, onCleanup }) => {
				onCleanup(() => {});
			});

		expect(isSubscriptionDef(onPostCreated)).toBe(true);
		expect(isSubscriptionDef({})).toBe(false);
		expect(isSubscriptionDef(null)).toBe(false);
		expect(isSubscriptionDef({ _type: "query" })).toBe(false);
	});

	it("subscriber receives correct context", () => {
		type TestContext = { events: { on: (event: string, handler: (data: unknown) => void) => () => void } };

		const onPostCreated = subscription<TestContext>()
			.args(z.object({ authorId: z.string().optional() }))
			.returns(Post)
			.subscribe(({ args, ctx }) => ({ emit, onCleanup }) => {
				// Type checking - these should compile
				const unsub = ctx.events.on("post:created", (data) => {
					if (!args.authorId || (data as { authorId?: string }).authorId === args.authorId) {
						emit(data);
					}
				});
				onCleanup(unsub);
			});

		// Verify structure
		expect(typeof onPostCreated._subscriber).toBe("function");

		// Test that subscriber can be called
		const publisher = onPostCreated._subscriber({
			input: { authorId: "user1" },
			ctx: {
				events: {
					on: (_event, _handler) => {
						// Mock implementation
						return () => {};
					},
				},
			},
		});

		// Publisher should be a function that receives callbacks
		expect(typeof publisher).toBe("function");
	});
});
