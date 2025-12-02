/**
 * @sylphx/lens-server - Handlers
 *
 * Protocol handlers for bridging the Lens app to various frameworks.
 */

// SSE Handler
export {
	createSSEHandler,
	type SSEClientInfo,
	SSEHandler,
	type SSEHandlerConfig as SSEHandlerOptions,
} from "../sse/handler.js";

// HTTP Handler
export {
	// Deprecated aliases
	createHTTPAdapter,
	createHTTPHandler,
	type HTTPAdapter,
	type HTTPAdapterOptions,
	type HTTPHandler,
	type HTTPHandlerOptions,
} from "./http.js";

// WebSocket Handler
export {
	// Deprecated aliases
	createWSAdapter,
	createWSHandler,
	type WSAdapter,
	type WSAdapterOptions,
	type WSHandler,
	type WSHandlerOptions,
} from "./ws.js";

// =============================================================================
// Deprecated SSE Aliases
// =============================================================================

export {
	createSSEHandler as createSSEAdapter,
	type SSEHandlerConfig as SSEAdapterOptions,
} from "../sse/handler.js";
