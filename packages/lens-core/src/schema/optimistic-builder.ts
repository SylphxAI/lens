/**
 * OptimisticBuilder - Build optimistic update configurations
 *
 * Uses Proxy-based draft pattern (similar to Immer) to record operations.
 * All operations are serializable for multi-language client support.
 */

import type {
	Descriptor,
	FieldDescriptor,
	Operation,
	OptimisticConfig,
	SetOperation,
	ArrayPushOperation,
	ArraySpliceOperation,
} from "./optimistic-types.js";
import { TransformUtils } from "./transform-utils.js";

/**
 * Symbols for internal use
 */
const INPUT_PROXY_MARKER = Symbol("input-proxy");
const DRAFT_PROXY_MARKER = Symbol("draft-proxy");

/**
 * Create input proxy that records all accesses
 */
function createInputProxy<T>(path: string[] = []): any {
	const handler: ProxyHandler<any> = {
		get(target, prop) {
			// Return path when requested
			if (prop === "__inputPath__") {
				return path;
			}

			if (prop === INPUT_PROXY_MARKER) {
				return true;
			}

			// Create nested proxy for deeper access
			return createInputProxy([...path, String(prop)]);
		},
	};

	return new Proxy({}, handler);
}

/**
 * Create draft proxy that records all mutations
 */
function createDraftProxy<T>(path: string[], operations: Operation[]): any {
	const handler: ProxyHandler<any> = {
		set(target, prop, value) {
			// Record set operation
			operations.push({
				op: "set",
				path: [...path, String(prop)],
				value: extractDescriptor(value),
			});

			return true;
		},

		get(target, prop) {
			if (prop === DRAFT_PROXY_MARKER) {
				return true;
			}

			// Array methods
			if (prop === "push") {
				return (...items: any[]) => {
					operations.push({
						op: "array-push",
						path,
						items: items.map((item) => extractDescriptor(item)),
					});
				};
			}

			if (prop === "splice") {
				return (start: number, deleteCount: number, ...items: any[]) => {
					operations.push({
						op: "array-splice",
						path,
						start,
						deleteCount,
						items: items.map((item) => extractDescriptor(item)),
					});
				};
			}

			// Nested access - create nested draft proxy
			return createDraftProxy([...path, String(prop)], operations);
		},
	};

	return new Proxy({}, handler);
}

/**
 * Extract descriptor from value
 */
function extractDescriptor(value: any): Descriptor {
	// Already a descriptor
	if (value && typeof value === "object" && "type" in value) {
		return value;
	}

	// Input proxy
	if (value && typeof value === "object" && "__inputPath__" in value) {
		return {
			type: "field",
			path: value.__inputPath__,
		};
	}

	// Literal value
	return {
		type: "literal",
		value,
	};
}

/**
 * Optimistic builder for defining optimistic updates
 *
 * Usage:
 * ```ts
 * .optimistic((opt) => opt
 *   .entity('Session')
 *   .id($ => $.sessionId)
 *   .apply((draft, input, t) => {
 *     draft.title = input.newTitle;
 *     draft.updatedAt = t.now();
 *   })
 * )
 * ```
 */
export class OptimisticBuilder<TInput = any, TOutput = any> {
	private config: Partial<OptimisticConfig> = {};

	/**
	 * Specify entity type
	 *
	 * @example
	 * .entity('Session')
	 */
	entity(name: string): this {
		this.config.entity = name;
		return this;
	}

	/**
	 * Specify entity ID field
	 *
	 * @example
	 * .id($ => $.sessionId)
	 * .id($ => $.user.id)  // Nested
	 */
	id(accessor: (input: any) => any): this {
		const proxy = createInputProxy<TInput>();
		accessor(proxy);
		this.config.id = {
			type: "field",
			path: proxy.__inputPath__,
		};
		return this;
	}

	/**
	 * Apply optimistic updates with draft pattern
	 *
	 * @example
	 * .apply((draft, input, t) => {
	 *   draft.title = input.newTitle;
	 *   draft.status = t.if(input.isActive, 'active', 'idle');
	 *   draft.updatedAt = t.now();
	 * })
	 */
	apply(fn: (draft: TOutput, input: TInput, utils: TransformUtils<TInput>) => void): this {
		const operations: Operation[] = [];

		// Create proxies
		const draft = createDraftProxy<TOutput>([], operations);
		const input = createInputProxy<TInput>();
		const utils = new TransformUtils<TInput>();

		// Execute function to record operations
		fn(draft, input, utils);

		// Store operations
		this.config.operations = operations;

		return this;
	}

	/**
	 * Build final configuration
	 * @internal
	 */
	build(): OptimisticConfig {
		if (!this.config.entity) {
			throw new Error("OptimisticBuilder: entity() is required");
		}

		if (!this.config.id) {
			throw new Error("OptimisticBuilder: id() is required");
		}

		if (!this.config.operations) {
			throw new Error("OptimisticBuilder: apply() is required");
		}

		return {
			entity: this.config.entity,
			id: this.config.id,
			operations: this.config.operations,
		};
	}
}
