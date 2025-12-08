/**
 * @sylphx/lens-server - HTTP Handler Tests
 */

import { describe, expect, it } from "bun:test";
import { mutation, query } from "@sylphx/lens-core";
import { z } from "zod";
import { createApp } from "../server/create.js";
import { createHTTPHandler } from "./http.js";

// =============================================================================
// Test Queries and Mutations
// =============================================================================

const getUser = query()
	.input(z.object({ id: z.string() }))
	.resolve(({ input }) => ({
		id: input.id,
		name: "Test User",
	}));

const createUser = mutation()
	.input(z.object({ name: z.string() }))
	.resolve(({ input }) => ({
		id: "new-id",
		name: input.name,
	}));

// =============================================================================
// Tests
// =============================================================================

describe("createHTTPHandler", () => {
	it("creates an HTTP handler from app", () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		expect(typeof handler).toBe("function");
		expect(typeof handler.handle).toBe("function");
	});

	it("returns metadata on GET /__lens/metadata", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/__lens/metadata", {
			method: "GET",
		});

		const response = await handler(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.version).toBeDefined();
		expect(data.operations).toBeDefined();
		expect(data.operations.getUser.type).toBe("query");
		expect(data.operations.createUser.type).toBe("mutation");
	});

	it("executes query via POST", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				operation: "getUser",
				input: { id: "123" },
			}),
		});

		const response = await handler(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.data).toEqual({ id: "123", name: "Test User" });
	});

	it("executes mutation via POST", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				operation: "createUser",
				input: { name: "New User" },
			}),
		});

		const response = await handler(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.data).toEqual({ id: "new-id", name: "New User" });
	});

	it("supports path prefix", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app, { pathPrefix: "/api" });

		// Metadata at /api/__lens/metadata
		const metadataRequest = new Request("http://localhost/api/__lens/metadata", {
			method: "GET",
		});
		const metadataResponse = await handler(metadataRequest);
		expect(metadataResponse.status).toBe(200);

		// Operation at /api
		const operationRequest = new Request("http://localhost/api", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				operation: "getUser",
				input: { id: "456" },
			}),
		});
		const operationResponse = await handler(operationRequest);
		expect(operationResponse.status).toBe(200);

		const data = await operationResponse.json();
		expect(data.data.id).toBe("456");
	});

	it("handles CORS preflight in development mode", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app, { errors: { development: true } });

		const request = new Request("http://localhost/", {
			method: "OPTIONS",
		});

		const response = await handler(request);
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("does not allow CORS by default in production mode", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app); // Production mode is default

		const request = new Request("http://localhost/", {
			method: "OPTIONS",
		});

		const response = await handler(request);
		expect(response.status).toBe(204);
		// No Access-Control-Allow-Origin header in production without explicit config
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	it("allows CORS with explicit origin configuration", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app, { cors: { origin: "https://example.com" } });

		const request = new Request("http://localhost/", {
			method: "OPTIONS",
		});

		const response = await handler(request);
		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
	});

	it("returns 404 for unknown paths", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/unknown", {
			method: "GET",
		});

		const response = await handler(request);
		expect(response.status).toBe(404);
	});

	it("returns error for missing operation", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});

		const response = await handler(request);
		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toContain("Missing operation");
	});

	it("returns error for unknown operation", async () => {
		const app = createApp({
			queries: { getUser },
			mutations: { createUser },
		});
		const handler = createHTTPHandler(app);

		const request = new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				operation: "unknownOperation",
				input: {},
			}),
		});

		const response = await handler(request);
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.error).toContain("not found");
	});
});
