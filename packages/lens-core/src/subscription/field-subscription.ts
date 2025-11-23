/**
 * Field-Level Subscriptions
 *
 * Framework-agnostic API for subscribing to individual field updates.
 * Provides granular control over streaming fields (start/delta/end) and
 * regular fields (onChange).
 *
 * This is the LOW-LEVEL API. Framework-specific wrappers (lens-react, lens-vue)
 * will provide higher-level abstractions that automatically handle these events.
 *
 * @module @sylphx/lens-core/subscription
 */

/**
 * Delta operation for streaming field updates
 *
 * Represents an incremental change to a field value.
 * Used by streaming fields that emit start/delta/end events.
 */
export interface DeltaOperation {
	/** Operation type */
	op: "insert" | "delete" | "replace";
	/** Position in the string/array */
	pos?: number;
	/** Text to insert/replace */
	text?: string;
	/** Number of characters to delete */
	deleteCount?: number;
}

/**
 * Streaming field handlers
 *
 * For fields that stream updates in real-time (e.g., AI-generated content).
 * Emits three events: start (initialization), delta (incremental), end (finalization).
 *
 * @example
 * ```typescript
 * Session.api.get.subscribe({
 *   id: '1',
 *   fields: {
 *     title: {
 *       onStart: (initial) => console.log('Started:', initial),
 *       onDelta: (delta) => console.log('Delta:', delta),
 *       onEnd: (final) => console.log('Completed:', final),
 *     }
 *   }
 * });
 * ```
 */
export interface StreamingFieldHandlers<TValue = any> {
	/**
	 * Called when streaming starts
	 *
	 * @param value - Initial value (often empty string)
	 */
	onStart?: (value: TValue) => void;

	/**
	 * Called for each incremental update
	 *
	 * @param delta - Delta operation describing the change
	 */
	onDelta?: (delta: DeltaOperation) => void;

	/**
	 * Called when streaming completes
	 *
	 * @param value - Final complete value
	 */
	onEnd?: (value: TValue) => void;

	/**
	 * Called if streaming encounters an error
	 *
	 * @param error - Error that occurred
	 */
	onError?: (error: Error) => void;
}

/**
 * Regular field handlers
 *
 * For fields that update with complete values (not streaming).
 * Most fields use this pattern.
 *
 * @example
 * ```typescript
 * Session.api.get.subscribe({
 *   id: '1',
 *   fields: {
 *     status: {
 *       onChange: (status) => console.log('Status:', status),
 *     }
 *   }
 * });
 * ```
 */
export interface FieldHandlers<TValue = any> {
	/**
	 * Called when field value changes
	 *
	 * @param value - New field value
	 * @param oldValue - Previous field value
	 */
	onChange?: (value: TValue, oldValue?: TValue) => void;

	/**
	 * Called if field update encounters an error
	 *
	 * @param error - Error that occurred
	 */
	onError?: (error: Error) => void;
}

/**
 * Combined field subscription handlers
 *
 * A field can use either streaming handlers OR regular handlers, not both.
 */
export type FieldSubscriptionHandlers<TValue = any> =
	| StreamingFieldHandlers<TValue>
	| FieldHandlers<TValue>;

/**
 * Field subscriptions configuration
 *
 * Maps field names to their subscription handlers.
 * Each field can have different handler types based on its behavior.
 *
 * @example
 * ```typescript
 * const fieldSubscriptions: FieldSubscriptions = {
 *   // Streaming field (AI-generated content)
 *   title: {
 *     onStart: (t) => console.log('Title started:', t),
 *     onDelta: (d) => console.log('Title delta:', d),
 *     onEnd: (t) => console.log('Title done:', t),
 *   },
 *
 *   // Regular field (direct value updates)
 *   status: {
 *     onChange: (s) => console.log('Status:', s),
 *   },
 *
 *   // Another regular field
 *   messageCount: {
 *     onChange: (count) => console.log('Messages:', count),
 *   },
 * };
 * ```
 */
export type FieldSubscriptions<TEntity = any> = {
	[K in keyof TEntity]?: FieldSubscriptionHandlers<TEntity[K]>;
};

/**
 * Subscription options with field-level support
 *
 * Extends the standard subscription options to support field-level subscriptions.
 */
export interface FieldSubscriptionOptions<TEntity = any> {
	/**
	 * Field-level subscriptions
	 *
	 * Subscribe to individual fields with granular control.
	 * Mutually exclusive with `select` - use one or the other.
	 */
	fields?: FieldSubscriptions<TEntity>;

	/**
	 * Traditional field selection
	 *
	 * Subscribe to entity with field selection (legacy mode).
	 * Mutually exclusive with `fields`.
	 */
	select?: any;

	/**
	 * Include related entities
	 *
	 * Works with both field subscriptions and select.
	 */
	include?: any;
}

/**
 * Field update event
 *
 * Internal event type used by the subscription system.
 */
export interface FieldUpdateEvent {
	/** Entity ID */
	entityId: string;
	/** Field name */
	fieldName: string;
	/** Event type */
	type: "start" | "delta" | "end" | "change" | "error";
	/** Field value (for start/end/change events) */
	value?: any;
	/** Delta operation (for delta events) */
	delta?: DeltaOperation;
	/** Error (for error events) */
	error?: Error;
	/** Previous value (for change events) */
	oldValue?: any;
}

/**
 * Check if handlers are streaming field handlers
 */
export function isStreamingHandlers(
	handlers: FieldSubscriptionHandlers,
): handlers is StreamingFieldHandlers {
	return "onStart" in handlers || "onDelta" in handlers || "onEnd" in handlers;
}

/**
 * Check if handlers are regular field handlers
 */
export function isFieldHandlers(
	handlers: FieldSubscriptionHandlers,
): handlers is FieldHandlers {
	return "onChange" in handlers;
}

/**
 * Apply delta operation to a value
 *
 * Utility function to apply delta operations to string values.
 * Used by framework-specific libraries to automatically handle deltas.
 *
 * @param currentValue - Current field value
 * @param delta - Delta operation to apply
 * @returns Updated value
 *
 * @example
 * ```typescript
 * let title = "Hello";
 * title = applyDelta(title, {
 *   op: 'insert',
 *   pos: 5,
 *   text: ' World'
 * });
 * // title = "Hello World"
 * ```
 */
export function applyDelta(currentValue: string, delta: DeltaOperation): string {
	switch (delta.op) {
		case "insert":
			if (delta.pos === undefined || delta.text === undefined) {
				throw new Error("Insert operation requires pos and text");
			}
			return (
				currentValue.slice(0, delta.pos) +
				delta.text +
				currentValue.slice(delta.pos)
			);

		case "delete":
			if (delta.pos === undefined || delta.deleteCount === undefined) {
				throw new Error("Delete operation requires pos and deleteCount");
			}
			return (
				currentValue.slice(0, delta.pos) +
				currentValue.slice(delta.pos + delta.deleteCount)
			);

		case "replace":
			if (delta.text === undefined) {
				throw new Error("Replace operation requires text");
			}
			return delta.text;

		default:
			throw new Error(`Unknown delta operation: ${(delta as any).op}`);
	}
}

/**
 * Field subscription manager
 *
 * Manages field-level subscriptions and dispatches events to appropriate handlers.
 * Used internally by the subscription system.
 */
export class FieldSubscriptionManager {
	private subscriptions: Map<string, FieldSubscriptions> = new Map();

	/**
	 * Subscribe to field updates
	 *
	 * @param entityId - Entity ID to subscribe to
	 * @param fields - Field subscriptions
	 * @returns Unsubscribe function
	 */
	subscribe(entityId: string, fields: FieldSubscriptions): () => void {
		const key = `entity:${entityId}`;
		this.subscriptions.set(key, fields);

		return () => {
			this.subscriptions.delete(key);
		};
	}

	/**
	 * Dispatch field update event
	 *
	 * Routes the event to the appropriate handler based on event type.
	 *
	 * @param event - Field update event
	 */
	dispatch(event: FieldUpdateEvent): void {
		const key = `entity:${event.entityId}`;
		const fields = this.subscriptions.get(key);

		if (!fields) return;

		const handlers = fields[event.fieldName];
		if (!handlers) return;

		try {
			switch (event.type) {
				case "start":
					if (isStreamingHandlers(handlers) && handlers.onStart) {
						handlers.onStart(event.value);
					}
					break;

				case "delta":
					if (isStreamingHandlers(handlers) && handlers.onDelta && event.delta) {
						handlers.onDelta(event.delta);
					}
					break;

				case "end":
					if (isStreamingHandlers(handlers) && handlers.onEnd) {
						handlers.onEnd(event.value);
					}
					break;

				case "change":
					if (isFieldHandlers(handlers) && handlers.onChange) {
						handlers.onChange(event.value, event.oldValue);
					}
					break;

				case "error":
					if (event.error) {
						if (isStreamingHandlers(handlers) && handlers.onError) {
							handlers.onError(event.error);
						} else if (isFieldHandlers(handlers) && handlers.onError) {
							handlers.onError(event.error);
						}
					}
					break;
			}
		} catch (error) {
			// Isolate handler errors
			console.error(`Error in field subscription handler:`, error);
		}
	}

	/**
	 * Clear all subscriptions
	 */
	clear(): void {
		this.subscriptions.clear();
	}
}

/**
 * Global field subscription manager instance
 */
let globalManager: FieldSubscriptionManager | null = null;

/**
 * Get global field subscription manager
 */
export function getFieldSubscriptionManager(): FieldSubscriptionManager {
	if (!globalManager) {
		globalManager = new FieldSubscriptionManager();
	}
	return globalManager;
}

/**
 * Set global field subscription manager
 *
 * Useful for testing or custom implementations.
 */
export function setFieldSubscriptionManager(
	manager: FieldSubscriptionManager,
): void {
	globalManager = manager;
}
