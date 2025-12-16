/**
 * @sylphx/lens-core - Lens Subscription Integration Tests
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { lens } from "./lens.js";
import { id, string } from "./schema/fields.js";
import { model } from "./schema/model.js";

// Test model
const Post = model("Post", {
	id: id(),
	title: string(),
	authorId: string(),
});

type TestContext = {
	events: {
		on: (event: string, handler: (data: unknown) => void) => () => void;
	};
};

describe("lens() subscription factory", () => {
	it("creates subscription with pre-typed context", () => {
		const { subscription } = lens<TestContext>();

		const onPostCreated = subscription()
			.input(z.object({ authorId: z.string().optional() }))
			.returns(Post)
			.subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
				// ctx should be TestContext (type-checked at compile time)
				const unsub = ctx.events.on("post:created", (data) => {
					if (!input.authorId || (data as { authorId?: string }).authorId === input.authorId) {
						emit(data);
					}
				});
				onCleanup(unsub);
			});

		expect(onPostCreated._type).toBe("subscription");
		expect(typeof onPostCreated._subscriber).toBe("function");
	});

	it("subscription factory works without input", () => {
		const { subscription } = lens<TestContext>();

		const onAnyPost = subscription()
			.returns(Post)
			.subscribe(({ ctx }) => ({ emit, onCleanup }) => {
				const unsub = ctx.events.on("post:created", emit);
				onCleanup(unsub);
			});

		expect(onAnyPost._type).toBe("subscription");
	});

	it("subscription factory works with name", () => {
		const { subscription } = lens<TestContext>();

		const onPostCreated = subscription("onPostCreated")
			.returns(Post)
			.subscribe(({ ctx }) => ({ emit, onCleanup }) => {
				const unsub = ctx.events.on("post:created", emit);
				onCleanup(unsub);
			});

		expect(onPostCreated._name).toBe("onPostCreated");
	});

	it("lens with plugins includes subscription", () => {
		const result = lens<TestContext>();

		expect(result.subscription).toBeDefined();
		expect(typeof result.subscription).toBe("function");
	});
});
