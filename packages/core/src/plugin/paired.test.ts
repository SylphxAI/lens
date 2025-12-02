/**
 * @sylphx/lens-core - Paired Plugin Tests
 */

import { describe, expect, it } from "bun:test";
import {
	isPairedPlugin,
	type PairedPlugin,
	resolveClientPlugins,
	resolveServerPlugins,
} from "./paired.js";

// =============================================================================
// Mock Types
// =============================================================================

interface MockServerPlugin {
	name: string;
	onConnect?: () => void;
}

interface MockClientPlugin {
	name: string;
	beforeRequest?: () => void;
}

// =============================================================================
// Tests
// =============================================================================

describe("isPairedPlugin", () => {
	it("returns true for paired plugins", () => {
		const plugin: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "test-server" },
			client: { name: "test-client" },
		};

		expect(isPairedPlugin(plugin)).toBe(true);
	});

	it("returns false for regular server plugins", () => {
		const plugin: MockServerPlugin = { name: "test" };
		expect(isPairedPlugin(plugin)).toBe(false);
	});

	it("returns false for regular client plugins", () => {
		const plugin: MockClientPlugin = { name: "test" };
		expect(isPairedPlugin(plugin)).toBe(false);
	});

	it("returns false for null", () => {
		expect(isPairedPlugin(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isPairedPlugin(undefined)).toBe(false);
	});

	it("returns false for objects without __paired marker", () => {
		const obj = { server: {}, client: {} };
		expect(isPairedPlugin(obj)).toBe(false);
	});

	it("returns false for objects with __paired = false", () => {
		const obj = { __paired: false, server: {}, client: {} };
		expect(isPairedPlugin(obj)).toBe(false);
	});
});

describe("resolveServerPlugins", () => {
	it("extracts server plugin from paired plugins", () => {
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired-server" },
			client: { name: "paired-client" },
		};

		const result = resolveServerPlugins([paired]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("paired-server");
	});

	it("passes through regular server plugins", () => {
		const regular: MockServerPlugin = { name: "regular-server" };

		const result = resolveServerPlugins([regular]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("regular-server");
	});

	it("handles mixed array of plugins", () => {
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired-server" },
			client: { name: "paired-client" },
		};
		const regular: MockServerPlugin = { name: "regular-server" };

		const result = resolveServerPlugins([paired, regular]);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("paired-server");
		expect(result[1].name).toBe("regular-server");
	});

	it("returns empty array for empty input", () => {
		const result = resolveServerPlugins([]);
		expect(result).toHaveLength(0);
	});

	it("preserves plugin methods", () => {
		const onConnect = () => {};
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired", onConnect },
			client: { name: "paired" },
		};

		const result = resolveServerPlugins([paired]);
		expect(result[0].onConnect).toBe(onConnect);
	});
});

describe("resolveClientPlugins", () => {
	it("extracts client plugin from paired plugins", () => {
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired-server" },
			client: { name: "paired-client" },
		};

		const result = resolveClientPlugins([paired]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("paired-client");
	});

	it("passes through regular client plugins", () => {
		const regular: MockClientPlugin = { name: "regular-client" };

		const result = resolveClientPlugins([regular]);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("regular-client");
	});

	it("handles mixed array of plugins", () => {
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired-server" },
			client: { name: "paired-client" },
		};
		const regular: MockClientPlugin = { name: "regular-client" };

		const result = resolveClientPlugins([paired, regular]);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("paired-client");
		expect(result[1].name).toBe("regular-client");
	});

	it("returns empty array for empty input", () => {
		const result = resolveClientPlugins([]);
		expect(result).toHaveLength(0);
	});

	it("preserves plugin methods", () => {
		const beforeRequest = () => {};
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired" },
			client: { name: "paired", beforeRequest },
		};

		const result = resolveClientPlugins([paired]);
		expect(result[0].beforeRequest).toBe(beforeRequest);
	});
});

describe("PairedPlugin usage patterns", () => {
	it("allows creating compression-like paired plugin", () => {
		const compression: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: {
				name: "compression",
				onConnect: () => {
					// Server-side: compress before sending
				},
			},
			client: {
				name: "compression",
				beforeRequest: () => {
					// Client-side: decompress after receiving
				},
			},
		};

		expect(isPairedPlugin(compression)).toBe(true);

		const serverPlugins = resolveServerPlugins([compression]);
		const clientPlugins = resolveClientPlugins([compression]);

		expect(serverPlugins[0].name).toBe("compression");
		expect(clientPlugins[0].name).toBe("compression");
	});

	it("allows mixing paired and regular plugins", () => {
		const paired: PairedPlugin<MockServerPlugin, MockClientPlugin> = {
			__paired: true,
			server: { name: "paired" },
			client: { name: "paired" },
		};

		const serverOnly: MockServerPlugin = { name: "server-only" };
		const clientOnly: MockClientPlugin = { name: "client-only" };

		// Server gets paired.server + serverOnly
		const serverPlugins = resolveServerPlugins([paired, serverOnly]);
		expect(serverPlugins).toHaveLength(2);
		expect(serverPlugins.map((p) => p.name)).toEqual(["paired", "server-only"]);

		// Client gets paired.client + clientOnly
		const clientPlugins = resolveClientPlugins([paired, clientOnly]);
		expect(clientPlugins).toHaveLength(2);
		expect(clientPlugins.map((p) => p.name)).toEqual(["paired", "client-only"]);
	});
});
