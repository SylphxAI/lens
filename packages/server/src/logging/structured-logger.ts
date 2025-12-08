/**
 * @sylphx/lens-server - Structured Logging
 *
 * Production-ready structured logging with JSON output.
 * Compatible with log aggregators (DataDog, Splunk, ELK, etc.)
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Log levels (RFC 5424 severity)
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Base log context - always included
 */
export interface LogContext {
	/** Timestamp in ISO format */
	timestamp: string;
	/** Log level */
	level: LogLevel;
	/** Log message */
	message: string;
	/** Service/component name */
	service?: string;
}

/**
 * Request context for API operations
 */
export interface RequestContext {
	/** Unique request/correlation ID */
	requestId?: string;
	/** Operation being executed */
	operation?: string;
	/** Client identifier */
	clientId?: string;
	/** Request duration in milliseconds */
	durationMs?: number;
}

/**
 * Error context for error logs
 */
export interface ErrorContext {
	/** Error name/type */
	errorType?: string;
	/** Error message */
	errorMessage?: string;
	/** Stack trace (only in development) */
	stack?: string;
	/** Error code */
	errorCode?: string;
}

/**
 * WebSocket context
 */
export interface WebSocketContext {
	/** Message type */
	messageType?: string;
	/** Subscription ID */
	subscriptionId?: string;
	/** Entity type */
	entity?: string;
	/** Entity ID */
	entityId?: string;
	/** Connection count */
	connectionCount?: number;
	/** Subscription count */
	subscriptionCount?: number;
}

/**
 * Performance context
 */
export interface PerformanceContext {
	/** Memory usage in bytes */
	memoryUsed?: number;
	/** CPU usage percentage */
	cpuPercent?: number;
	/** Active connections */
	activeConnections?: number;
	/** Active subscriptions */
	activeSubscriptions?: number;
	/** Messages per second */
	messagesPerSecond?: number;
}

/**
 * Full log entry type
 */
export type LogEntry = LogContext &
	Partial<RequestContext> &
	Partial<ErrorContext> &
	Partial<WebSocketContext> &
	Partial<PerformanceContext> & {
		[key: string]: unknown;
	};

/**
 * Logger output destination
 */
export interface LogOutput {
	write(entry: LogEntry): void;
}

/**
 * Structured logger configuration
 */
export interface StructuredLoggerOptions {
	/** Service name for log entries */
	service?: string;
	/** Minimum log level to output */
	level?: LogLevel;
	/** Include stack traces in error logs */
	includeStackTrace?: boolean;
	/** Custom output destination */
	output?: LogOutput;
	/** Additional context to include in all logs */
	defaultContext?: Record<string, unknown>;
}

// =============================================================================
// Log Level Priority
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

// =============================================================================
// Default Outputs
// =============================================================================

/**
 * JSON console output (production)
 */
export const jsonOutput: LogOutput = {
	write(entry: LogEntry): void {
		console.log(JSON.stringify(entry));
	},
};

/**
 * Pretty console output (development)
 */
export const prettyOutput: LogOutput = {
	write(entry: LogEntry): void {
		const { timestamp, level, message, ...rest } = entry;
		const color = {
			debug: "\x1b[36m", // cyan
			info: "\x1b[32m", // green
			warn: "\x1b[33m", // yellow
			error: "\x1b[31m", // red
			fatal: "\x1b[35m", // magenta
		}[level];
		const reset = "\x1b[0m";

		const contextStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";

		console.log(`${timestamp} ${color}[${level.toUpperCase()}]${reset} ${message}${contextStr}`);
	},
};

// =============================================================================
// Structured Logger
// =============================================================================

/**
 * Create a structured logger instance.
 *
 * @example
 * ```typescript
 * const logger = createStructuredLogger({
 *   service: 'lens-server',
 *   level: 'info',
 * });
 *
 * logger.info('Request started', { requestId: 'abc', operation: 'getUser' });
 * logger.error('Request failed', { requestId: 'abc', error: err });
 * ```
 */
export function createStructuredLogger(options: StructuredLoggerOptions = {}) {
	const {
		service = "lens",
		level: minLevel = "info",
		includeStackTrace = false,
		output = jsonOutput,
		defaultContext = {},
	} = options;

	const minPriority = LOG_LEVEL_PRIORITY[minLevel];

	function shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= minPriority;
	}

	function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
		if (!shouldLog(level)) return;

		// Extract error if present
		const error = context.error instanceof Error ? context.error : undefined;
		const errorContext: Partial<ErrorContext> = {};

		if (error) {
			errorContext.errorType = error.name;
			errorContext.errorMessage = error.message;
			if (includeStackTrace) {
				errorContext.stack = error.stack;
			}
		}

		// Build log entry
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			service,
			...defaultContext,
			...context,
			...errorContext,
		};

		// Remove the original error object from context
		if ("error" in entry && entry.error instanceof Error) {
			delete entry.error;
		}

		output.write(entry);
	}

	return {
		debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
		info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
		warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
		error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
		fatal: (message: string, context?: Record<string, unknown>) => log("fatal", message, context),

		/**
		 * Create a child logger with additional default context.
		 */
		child: (childContext: Record<string, unknown>) => {
			return createStructuredLogger({
				...options,
				defaultContext: { ...defaultContext, ...childContext },
			});
		},

		/**
		 * Log with request context (for tracking request lifecycle).
		 */
		request: (
			requestId: string,
			message: string,
			context?: Record<string, unknown>,
		) => {
			log("info", message, { requestId, ...context });
		},

		/**
		 * Log operation start (returns a function to log completion).
		 */
		startOperation: (
			operation: string,
			context?: Record<string, unknown>,
		): ((result?: { error?: Error; data?: unknown }) => void) => {
			const startTime = Date.now();
			const requestId = context?.requestId as string | undefined;

			log("debug", `Operation started: ${operation}`, { operation, ...context });

			return (result?: { error?: Error; data?: unknown }) => {
				const durationMs = Date.now() - startTime;

				if (result?.error) {
					log("error", `Operation failed: ${operation}`, {
						operation,
						requestId,
						durationMs,
						error: result.error,
					});
				} else {
					log("info", `Operation completed: ${operation}`, {
						operation,
						requestId,
						durationMs,
					});
				}
			};
		},
	};
}

/**
 * Structured logger type
 */
export type StructuredLogger = ReturnType<typeof createStructuredLogger>;

/**
 * Adapter to make structured logger compatible with basic logger interface.
 */
export function toBasicLogger(structuredLogger: StructuredLogger): {
	info: (message: string, ...args: unknown[]) => void;
	warn: (message: string, ...args: unknown[]) => void;
	error: (message: string, ...args: unknown[]) => void;
} {
	return {
		info: (message: string, ...args: unknown[]) => {
			structuredLogger.info(message, args.length > 0 ? { args } : undefined);
		},
		warn: (message: string, ...args: unknown[]) => {
			structuredLogger.warn(message, args.length > 0 ? { args } : undefined);
		},
		error: (message: string, ...args: unknown[]) => {
			const error = args.find((arg) => arg instanceof Error) as Error | undefined;
			structuredLogger.error(message, error ? { error } : args.length > 0 ? { args } : undefined);
		},
	};
}
