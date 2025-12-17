/**
 * @sylphx/lens-server - Handlers
 *
 * Streaming handlers for real-time communication.
 * HTTP is handled by app.fetch directly.
 */

// =============================================================================
// Framework Handler Utilities (for framework packages)
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
// WebSocket Handler
// =============================================================================

export {
	createWSHandler,
	DEFAULT_WS_HANDLER_CONFIG,
	type WSHandler,
	type WSHandlerConfig,
	type WSHandlerOptions,
} from "./ws.js";
