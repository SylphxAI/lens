/**
 * @sylphx/client - EntitySignal Tests
 */

import { describe, it, expect, mock } from "bun:test";
import { EntitySignal, createEntitySignal, deriveEntitySignal } from "./entity-signal";
import { effect } from "../signals/signal";

describe("EntitySignal", () => {
	it("creates field-level signals from initial data", () => {
		const entity = new EntitySignal({
			name: "John",
			age: 30,
			active: true,
		});

		expect(entity.$.name.value).toBe("John");
		expect(entity.$.age.value).toBe(30);
		expect(entity.$.active.value).toBe(true);
	});

	it("provides computed value from all fields", () => {
		const entity = new EntitySignal({
			name: "John",
			bio: "Hello",
		});

		expect(entity.value.value).toEqual({
			name: "John",
			bio: "Hello",
		});
	});

	it("updates value when field changes", () => {
		const entity = new EntitySignal({
			name: "John",
			bio: "Hello",
		});

		entity.setField("name", "Jane");

		expect(entity.$.name.value).toBe("Jane");
		expect(entity.value.value.name).toBe("Jane");
	});

	it("tracks field access", () => {
		const onFieldAccess = mock(() => {});
		const entity = new EntitySignal(
			{ name: "John", bio: "Hello", age: 30 },
			{ onFieldAccess },
		);

		// Access name
		const _ = entity.$.name.value;
		expect(onFieldAccess).toHaveBeenCalledWith("name");

		// Access bio
		const __ = entity.$.bio.value;
		expect(onFieldAccess).toHaveBeenCalledWith("bio");

		// Access name again (should not call again)
		const ___ = entity.$.name.value;
		expect(onFieldAccess).toHaveBeenCalledTimes(2);

		expect(entity.getAccessedFields()).toEqual(["name", "bio"]);
	});

	it("calls onDispose when disposed", () => {
		const onDispose = mock(() => {});
		const entity = new EntitySignal({ name: "John" }, { onDispose });

		entity.dispose();

		expect(onDispose).toHaveBeenCalled();
		expect(entity.disposed).toBe(true);
	});

	it("ignores updates after dispose", () => {
		const entity = new EntitySignal({ name: "John" });

		entity.dispose();
		entity.setField("name", "Jane");

		expect(entity.$.name.value).toBe("John");
	});

	it("applies server update to field", () => {
		const entity = new EntitySignal({ text: "Hello" });

		// Value update
		entity.updateField("text", { strategy: "value", data: "Hello World" });
		expect(entity.$.text.value).toBe("Hello World");
	});

	it("applies delta update for streaming text", () => {
		const entity = new EntitySignal({ text: "Hello" });

		// Delta update (append)
		entity.updateField("text", {
			strategy: "delta",
			data: [{ position: 5, insert: " World" }],
		});

		expect(entity.$.text.value).toBe("Hello World");
	});

	it("sets multiple fields at once", () => {
		const entity = new EntitySignal({
			name: "John",
			bio: "Hello",
			age: 30,
		});

		entity.setFields({ name: "Jane", age: 25 });

		expect(entity.$.name.value).toBe("Jane");
		expect(entity.$.bio.value).toBe("Hello"); // unchanged
		expect(entity.$.age.value).toBe(25);
	});
});

describe("Fine-grained reactivity", () => {
	it("field signal only triggers when that field changes", () => {
		const entity = new EntitySignal({
			name: "John",
			bio: "Hello",
		});

		let nameChanges = 0;
		let bioChanges = 0;

		// Track name changes
		effect(() => {
			const _ = entity.$.name.value;
			nameChanges++;
		});

		// Track bio changes
		effect(() => {
			const _ = entity.$.bio.value;
			bioChanges++;
		});

		// Initial effect runs
		expect(nameChanges).toBe(1);
		expect(bioChanges).toBe(1);

		// Change name only
		entity.setField("name", "Jane");
		expect(nameChanges).toBe(2);
		expect(bioChanges).toBe(1); // bio didn't change

		// Change bio only
		entity.setField("bio", "World");
		expect(nameChanges).toBe(2); // name didn't change
		expect(bioChanges).toBe(2);
	});

	it("value triggers when any field changes", () => {
		const entity = new EntitySignal({
			name: "John",
			bio: "Hello",
		});

		let valueChanges = 0;

		effect(() => {
			const _ = entity.value.value;
			valueChanges++;
		});

		expect(valueChanges).toBe(1);

		// Change name
		entity.setField("name", "Jane");
		expect(valueChanges).toBe(2);

		// Change bio
		entity.setField("bio", "World");
		expect(valueChanges).toBe(3);
	});
});

describe("createEntitySignal factory", () => {
	it("creates EntitySignal with options", () => {
		const onDispose = mock(() => {});
		const entity = createEntitySignal({ name: "John" }, { onDispose });

		expect(entity.$.name.value).toBe("John");

		entity.dispose();
		expect(onDispose).toHaveBeenCalled();
	});
});

describe("deriveEntitySignal", () => {
	it("creates partial signal from source", () => {
		const source = new EntitySignal({
			name: "John",
			bio: "Hello",
			age: 30,
			email: "john@example.com",
		});

		const partial = deriveEntitySignal(source, ["name", "bio"]);

		expect(partial.$.name.value).toBe("John");
		expect(partial.$.bio.value).toBe("Hello");
		expect(partial.hasField("age")).toBe(false);
		expect(partial.hasField("email")).toBe(false);
	});
});
