/**
 * @sylphx/lens-server - Handlers
 *
 * Streaming handlers for real-time communication.
 * HTTP is handled by app.fetch directly.
 */

// =============================================================================
// Server Client Proxy (for framework packages)
// =============================================================================

export { createServerClientProxy } from "./framework.js";

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
