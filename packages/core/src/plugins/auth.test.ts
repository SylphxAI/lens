/**
 * Tests for the unified auth plugin
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { authPlugin, type AuthClientAPI, type AuthServerAPI } from "./auth";
import { isConfiguredPlugin } from "./types";

describe("authPlugin", () => {
	describe("callable interface", () => {
		it("can be called as a function", () => {
			const configured = authPlugin();
			expect(isConfiguredPlugin(configured)).toBe(true);
			expect(configured.name).toBe("auth");
		});

		it("accepts config when called", () => {
			const configured = authPlugin({ tokenPrefix: "Token" });
			expect(configured.__config).toEqual({ tokenPrefix: "Token" });
		});

		it("preserves plugin properties", () => {
			// Plugin is callable but still has properties
			expect(authPlugin.name).toBe("auth");
			expect(authPlugin.version).toBe("1.0.0");
			expect(authPlugin.client).toBeDefined();
			expect(authPlugin.server).toBeDefined();
		});
	});

	describe("metadata", () => {
		it("has correct name and version", () => {
			expect(authPlugin.name).toBe("auth");
			expect(authPlugin.version).toBe("1.0.0");
		});

		it("has default config", () => {
			expect(authPlugin.defaultConfig).toEqual({
				headerName: "Authorization",
				tokenPrefix: "Bearer",
				storageKey: "lens_auth_token",
			});
		});

		it("has both client and server factories", () => {
			expect(authPlugin.client).toBeDefined();
			expect(authPlugin.server).toBeDefined();
		});
	});

	describe("client plugin", () => {
		let clientInstance: ReturnType<NonNullable<typeof authPlugin.client>>;
		let api: AuthClientAPI & { getAuthHeader: () => Record<string, string> | undefined };

		beforeEach(() => {
			// Clear localStorage if available
			if (typeof localStorage !== "undefined") {
				localStorage.clear();
			}
			clientInstance = authPlugin.client!({});
			api = clientInstance.api as typeof api;
		});

		afterEach(() => {
			clientInstance.destroy?.();
		});

		it("has correct name", () => {
			expect(clientInstance.name).toBe("auth");
		});

		it("exposes auth API", () => {
			expect(api.setToken).toBeDefined();
			expect(api.getToken).toBeDefined();
			expect(api.clearToken).toBeDefined();
			expect(api.isAuthenticated).toBeDefined();
		});

		it("starts unauthenticated", () => {
			expect(api.isAuthenticated()).toBe(false);
			expect(api.getToken()).toBeNull();
		});

		it("can set and get token", () => {
			api.setToken("test-token-123");
			expect(api.getToken()).toBe("test-token-123");
			expect(api.isAuthenticated()).toBe(true);
		});

		it("can clear token", () => {
			api.setToken("test-token-123");
			api.clearToken();
			expect(api.getToken()).toBeNull();
			expect(api.isAuthenticated()).toBe(false);
		});

		it("generates auth header", () => {
			api.setToken("test-token-123");
			const header = api.getAuthHeader();
			expect(header).toEqual({
				Authorization: "Bearer test-token-123",
			});
		});

		it("returns undefined header when no token", () => {
			expect(api.getAuthHeader()).toBeUndefined();
		});

		it("uses custom header name from config", () => {
			const customClient = authPlugin.client!({
				headerName: "X-Auth-Token",
				tokenPrefix: "",
			});
			const customApi = customClient.api as typeof api;

			customApi.setToken("custom-token");
			const header = customApi.getAuthHeader();
			expect(header).toEqual({
				"X-Auth-Token": " custom-token",
			});
		});
	});

	describe("server plugin", () => {
		let serverInstance: ReturnType<NonNullable<typeof authPlugin.server>>;
		let api: AuthServerAPI;

		beforeEach(() => {
			serverInstance = authPlugin.server!({
				validateToken: async (token) => {
					if (token === "valid-token") {
						return { valid: true, user: { id: "user-1", name: "Test User" } };
					}
					return { valid: false };
				},
			});
			api = serverInstance.api as AuthServerAPI;
		});

		it("has correct name", () => {
			expect(serverInstance.name).toBe("auth");
		});

		it("exposes server API", () => {
			expect(api.validateToken).toBeDefined();
			expect(api.getUserFromContext).toBeDefined();
		});

		it("validates valid token", async () => {
			const result = await api.validateToken("valid-token");
			expect(result.valid).toBe(true);
			expect(result.user).toEqual({ id: "user-1", name: "Test User" });
		});

		it("rejects invalid token", async () => {
			const result = await api.validateToken("invalid-token");
			expect(result.valid).toBe(false);
			expect(result.user).toBeUndefined();
		});

		it("extracts user from context", () => {
			const ctx = {
				request: {
					user: { id: "user-1" },
				},
			};
			expect(api.getUserFromContext(ctx)).toEqual({ id: "user-1" });
		});

		it("onBeforeResolve attaches user to context for valid token", async () => {
			const ctx = {
				request: {
					headers: {
						Authorization: "Bearer valid-token",
					},
				},
			};

			const result = await serverInstance.onBeforeResolve?.(ctx, "User", "get", { id: "1" });

			expect(result?.ctx?.request?.user).toEqual({
				id: "user-1",
				name: "Test User",
			});
		});

		it("onBeforeResolve returns undefined for invalid token", async () => {
			const ctx = {
				request: {
					headers: {
						Authorization: "Bearer invalid-token",
					},
				},
			};

			const result = await serverInstance.onBeforeResolve?.(ctx, "User", "get", { id: "1" });
			expect(result).toBeUndefined();
		});

		it("onBeforeResolve handles missing auth header", async () => {
			const ctx = {
				request: {
					headers: {},
				},
			};

			const result = await serverInstance.onBeforeResolve?.(ctx, "User", "get", { id: "1" });
			expect(result).toBeUndefined();
		});

		it("allows WebSocket connections", async () => {
			const ctx = { request: {} };
			const allowed = await serverInstance.onWSConnect?.(ctx);
			expect(allowed).toBe(true);
		});
	});

	describe("getClientConfig", () => {
		it("returns sanitized config without secrets", () => {
			const config = authPlugin.getClientConfig!({
				headerName: "X-Token",
				tokenPrefix: "Token",
				storageKey: "my_token",
				secret: "super-secret-key", // Should NOT be included
				validateToken: async () => ({ valid: false }), // Should NOT be included
			});

			expect(config).toEqual({
				headerName: "X-Token",
				tokenPrefix: "Token",
				storageKey: "my_token",
			});
			expect(config).not.toHaveProperty("secret");
			expect(config).not.toHaveProperty("validateToken");
		});

		it("uses defaults when config is undefined", () => {
			const config = authPlugin.getClientConfig!(undefined);

			expect(config).toEqual({
				headerName: "Authorization",
				tokenPrefix: "Bearer",
				storageKey: "lens_auth_token",
			});
		});
	});
});
