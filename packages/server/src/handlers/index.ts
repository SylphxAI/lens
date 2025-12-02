/**
 * @sylphx/lens-server - Handlers
 *
 * Protocol handlers for bridging the Lens app to various transports.
 */

// =============================================================================
// Unified Handler (HTTP + SSE)
// =============================================================================

export { createHandler, type Handler, type HandlerOptions } from "./unified.js";

// =============================================================================
// SSE Handler
// =============================================================================

export {
	createSSEHandler,
	SSEHandler,
	type SSEClientInfo,
	type SSEHandlerConfig as SSEHandlerOptions,
} from "../sse/handler.js";

// =============================================================================
// HTTP Handler
// =============================================================================

export {
	createHTTPHandler,
	type HTTPHandler,
	type HTTPHandlerOptions,
} from "./http.js";

// =============================================================================
// WebSocket Handler
// =============================================================================

export {
	createWSHandler,
	type WSHandler,
	type WSHandlerOptions,
} from "./ws.js";

// =============================================================================
// Deprecated Aliases (will be removed in next major version)
// =============================================================================

/** @deprecated Use `createHTTPHandler` instead */
export { createHTTPAdapter } from "./http.js";
/** @deprecated Use `HTTPHandler` instead */
export type { HTTPAdapter } from "./http.js";
/** @deprecated Use `HTTPHandlerOptions` instead */
export type { HTTPAdapterOptions } from "./http.js";

/** @deprecated Use `createWSHandler` instead */
export { createWSAdapter } from "./ws.js";
/** @deprecated Use `WSHandler` instead */
export type { WSAdapter } from "./ws.js";
/** @deprecated Use `WSHandlerOptions` instead */
export type { WSAdapterOptions } from "./ws.js";

/** @deprecated Use `createSSEHandler` instead */
export { createSSEHandler as createSSEAdapter } from "../sse/handler.js";
/** @deprecated Use `SSEHandlerOptions` instead */
export type { SSEHandlerConfig as SSEAdapterOptions } from "../sse/handler.js";
