/**
 * @lens/core - Auth Plugin
 *
 * Example unified authentication plugin demonstrating:
 * - Both client and server parts in one definition
 * - Client-side token management
 * - Server-side token validation
 * - Plugin API exposure
 * - Config sanitization for handshake
 */

import { defineUnifiedPlugin } from "./types";

// =============================================================================
// Types
// =============================================================================

/** Auth plugin configuration */
export interface AuthPluginConfig {
	/** Header name for auth token (default: Authorization) */
	headerName?: string;
	/** Token prefix (default: Bearer) */
	tokenPrefix?: string;
	/** Token storage key (default: lens_auth_token) */
	storageKey?: string;
	/** Server-side secret for JWT validation (server only) */
	secret?: string;
	/** Token validator function (server only) */
	validateToken?: (token: string) => Promise<{ valid: boolean; user?: unknown }>;
}

/** Auth API exposed to client */
export interface AuthClientAPI {
	/** Set auth token */
	setToken: (token: string) => void;
	/** Get current token */
	getToken: () => string | null;
	/** Clear token (logout) */
	clearToken: () => void;
	/** Check if authenticated */
	isAuthenticated: () => boolean;
}

/** Auth API exposed to server */
export interface AuthServerAPI {
	/** Validate a token */
	validateToken: (token: string) => Promise<{ valid: boolean; user?: unknown }>;
	/** Get user from context */
	getUserFromContext: (ctx: unknown) => unknown;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

/**
 * Unified auth plugin
 *
 * @example
 * ```typescript
 * import { authPlugin } from "@lens/core";
 *
 * // Client (simple)
 * const client = createClient({
 *   plugins: [authPlugin()],
 * });
 *
 * // Client (with config)
 * const client = createClient({
 *   plugins: [authPlugin({ tokenPrefix: "Token" })],
 * });
 *
 * // Access API
 * const auth = client.$plugins.get<AuthClientAPI>("auth");
 * auth?.setToken(response.token);
 *
 * // Server
 * const server = createServer({
 *   plugins: [authPlugin({
 *     secret: process.env.JWT_SECRET,
 *     validateToken: async (token) => ({ valid: true, user: decoded }),
 *   })],
 * });
 * ```
 */
export const authPlugin = defineUnifiedPlugin<AuthPluginConfig>({
	name: "auth",
	version: "1.0.0",

	defaultConfig: {
		headerName: "Authorization",
		tokenPrefix: "Bearer",
		storageKey: "lens_auth_token",
	},

	// Client-side implementation
	client: (config) => {
		const headerName = config?.headerName ?? "Authorization";
		const tokenPrefix = config?.tokenPrefix ?? "Bearer";
		const storageKey = config?.storageKey ?? "lens_auth_token";

		// In-memory token (fallback if no localStorage)
		let memoryToken: string | null = null;

		const getToken = (): string | null => {
			if (typeof localStorage !== "undefined") {
				return localStorage.getItem(storageKey);
			}
			return memoryToken;
		};

		const setToken = (token: string): void => {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(storageKey, token);
			}
			memoryToken = token;
		};

		const clearToken = (): void => {
			if (typeof localStorage !== "undefined") {
				localStorage.removeItem(storageKey);
			}
			memoryToken = null;
		};

		const isAuthenticated = (): boolean => {
			return getToken() !== null;
		};

		return {
			name: "auth",

			onInit: () => {
				// Could restore token from storage here
			},

			onBeforeMutation: (_ctx, _entity, _op, _input) => {
				// Token is added via transport headers, not here
				// This hook is for logging/analytics
			},

			api: {
				setToken,
				getToken,
				clearToken,
				isAuthenticated,
				// Helper to get auth header value
				getAuthHeader: (): Record<string, string> | undefined => {
					const token = getToken();
					if (!token) return undefined;
					return { [headerName]: `${tokenPrefix} ${token}` };
				},
			} as AuthClientAPI & { getAuthHeader: () => Record<string, string> | undefined },

			destroy: () => {
				// Don't clear token on destroy - user should explicitly logout
			},
		};
	},

	// Server-side implementation
	server: (config) => {
		const headerName = config?.headerName ?? "Authorization";
		const tokenPrefix = config?.tokenPrefix ?? "Bearer";

		const validateToken =
			config?.validateToken ??
			(async (_token: string) => {
				// Default: no validation (always invalid)
				return { valid: false };
			});

		const extractToken = (headers?: Record<string, string>): string | null => {
			if (!headers) return null;

			const authHeader = headers[headerName] || headers[headerName.toLowerCase()];
			if (!authHeader) return null;

			if (tokenPrefix && authHeader.startsWith(`${tokenPrefix} `)) {
				return authHeader.slice(tokenPrefix.length + 1);
			}

			return authHeader;
		};

		return {
			name: "auth",

			onInit: async () => {
				// Server initialization
			},

			onBeforeResolve: async (ctx, _entity, _op, _input) => {
				// Extract and validate token
				const token = extractToken(ctx.request?.headers);

				if (token) {
					const result = await validateToken(token);
					if (result.valid && result.user) {
						// Attach user to context
						return {
							ctx: {
								...ctx,
								request: {
									...ctx.request,
									user: result.user,
								},
							},
						};
					}
				}

				// No modification if no valid token
				return undefined;
			},

			onWSConnect: async (ctx) => {
				// Allow connection even without auth (individual ops may require it)
				return true;
			},

			api: {
				validateToken,
				getUserFromContext: (ctx: unknown) => {
					return (ctx as { request?: { user?: unknown } })?.request?.user;
				},
			} as AuthServerAPI,
		};
	},

	// Config sent to client during handshake (no secrets!)
	getClientConfig: (config) => ({
		headerName: config?.headerName ?? "Authorization",
		tokenPrefix: config?.tokenPrefix ?? "Bearer",
		storageKey: config?.storageKey ?? "lens_auth_token",
		// Note: secret and validateToken are NOT sent to client
	}),
});
