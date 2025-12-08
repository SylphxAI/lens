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
// Framework Handler Utilities
// =============================================================================

export {
	createFrameworkHandler,
	createServerClientProxy,
	type FrameworkHandlerOptions,
	handleWebMutation,
	handleWebQuery,
	handleWebSSE,
} from "./framework.js";

// =============================================================================
// SSE Handler
// =============================================================================

export {
	createSSEHandler,
	type SSEClient,
	SSEHandler,
	type SSEHandlerConfig as SSEHandlerOptions,
} from "../sse/handler.js";

// =============================================================================
// HTTP Handler
// =============================================================================

export {
	createHTTPHandler,
	type HealthCheckOptions,
	type HealthCheckResponse,
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
