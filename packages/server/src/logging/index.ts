/**
 * @sylphx/lens-server - Logging Module
 */

export {
	createStructuredLogger,
	toBasicLogger,
	jsonOutput,
	prettyOutput,
	type StructuredLogger,
	type StructuredLoggerOptions,
	type LogLevel,
	type LogContext,
	type LogEntry,
	type LogOutput,
	type RequestContext,
	type ErrorContext,
	type WebSocketContext,
	type PerformanceContext,
} from "./structured-logger.js";
