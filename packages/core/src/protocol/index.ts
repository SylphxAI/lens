/**
 * @sylphx/lens-core - Wire Protocol
 *
 * Clean, unambiguous protocol for server-client communication.
 * Single message type with discriminated union.
 */

// Apply operations
export { applyOp, applyOps } from "./apply.js";
// Types
export type {
	Message,
	MessageData,
	MessageObservable,
	MessageObserver,
	Op,
} from "./types.js";
// Type guards
export { isError, isOps, isSnapshot } from "./types.js";
