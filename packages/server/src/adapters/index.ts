/**
 * @sylphx/lens-server - Adapters
 *
 * Protocol adapters for bridging the Lens server to various frameworks.
 */

// SSE Adapter is exported from ../sse/handler.ts
// Re-export here for convenience
export {
	createSSEHandler as createSSEAdapter,
	type SSEClientInfo,
	SSEHandler,
	type SSEHandlerConfig as SSEAdapterOptions,
} from "../sse/handler.js";
// HTTP Adapter
export { createHTTPAdapter, type HTTPAdapter, type HTTPAdapterOptions } from "./http.js";
// WebSocket Adapter
export { createWSAdapter, type WSAdapter, type WSAdapterOptions } from "./ws.js";
