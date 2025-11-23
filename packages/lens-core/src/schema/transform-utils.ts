/**
 * TransformUtils - Declarative transform primitives for optimistic updates
 *
 * All transforms are language-agnostic and serializable.
 * Each client (TypeScript, Rust, Swift, etc.) implements these transforms.
 */

import type { Descriptor, TransformDescriptor } from "./optimistic-types.js";

/**
 * Transform utilities for building optimistic operations
 *
 * Usage:
 * ```ts
 * .apply((draft, input, t) => {
 *   draft.status = t.if(input.isActive, 'active', 'idle');
 *   draft.total = t.add(input.price, input.tax);
 *   draft.updatedAt = t.now();
 * })
 * ```
 */
export class TransformUtils<TInput = any> {
	// ===== Conditional Logic =====

	/**
	 * If-else conditional
	 *
	 * @example
	 * t.if(input.isActive, 'active', 'idle')
	 * // → condition ? ifTrue : ifFalse
	 */
	if<T>(condition: any, ifTrue: T, ifFalse: T): TransformDescriptor {
		return {
			type: "transform",
			name: "if",
			condition: this.toDescriptor(condition),
			ifTrue: this.toDescriptor(ifTrue),
			ifFalse: this.toDescriptor(ifFalse),
		};
	}

	/**
	 * Switch statement
	 *
	 * @example
	 * t.switch(input.level, {
	 *   'high': 1,
	 *   'medium': 2,
	 *   'low': 3
	 * }, 0)
	 */
	switch<T>(value: any, cases: Record<string, T>, defaultCase: T): TransformDescriptor {
		return {
			type: "transform",
			name: "switch",
			value: this.toDescriptor(value),
			cases: Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, this.toDescriptor(v)])),
			default: this.toDescriptor(defaultCase),
		};
	}

	/**
	 * First non-null value
	 *
	 * @example
	 * t.coalesce(input.name, input.id, 'Unknown')
	 */
	coalesce(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "coalesce",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Default value if null/undefined
	 *
	 * @example
	 * t.default(input.name, 'Anonymous')
	 */
	default(value: any, defaultValue: any): TransformDescriptor {
		return {
			type: "transform",
			name: "default",
			value: this.toDescriptor(value),
			defaultValue: this.toDescriptor(defaultValue),
		};
	}

	// ===== Math Operations =====

	/**
	 * Addition
	 *
	 * @example
	 * t.add(input.price, input.tax, 10)
	 */
	add(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "add",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Subtraction
	 *
	 * @example
	 * t.subtract(input.total, input.discount)
	 */
	subtract(a: any, b: any): TransformDescriptor {
		return {
			type: "transform",
			name: "subtract",
			a: this.toDescriptor(a),
			b: this.toDescriptor(b),
		};
	}

	/**
	 * Multiplication
	 *
	 * @example
	 * t.multiply(input.price, input.quantity)
	 */
	multiply(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "multiply",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Division
	 *
	 * @example
	 * t.divide(input.total, input.count)
	 */
	divide(a: any, b: any): TransformDescriptor {
		return {
			type: "transform",
			name: "divide",
			a: this.toDescriptor(a),
			b: this.toDescriptor(b),
		};
	}

	/**
	 * Modulo
	 *
	 * @example
	 * t.mod(input.value, 10)
	 */
	mod(a: any, b: any): TransformDescriptor {
		return {
			type: "transform",
			name: "mod",
			a: this.toDescriptor(a),
			b: this.toDescriptor(b),
		};
	}

	/**
	 * Maximum value
	 *
	 * @example
	 * t.max(input.a, input.b, 100)
	 */
	max(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "max",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Minimum value
	 *
	 * @example
	 * t.min(input.a, input.b, 0)
	 */
	min(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "min",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Absolute value
	 *
	 * @example
	 * t.abs(input.delta)
	 */
	abs(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "abs",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Round to integer
	 *
	 * @example
	 * t.round(input.price)
	 */
	round(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "round",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Floor
	 *
	 * @example
	 * t.floor(input.value)
	 */
	floor(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "floor",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Ceiling
	 *
	 * @example
	 * t.ceil(input.value)
	 */
	ceil(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "ceil",
			value: this.toDescriptor(value),
		};
	}

	// ===== String Operations =====

	/**
	 * Concatenate strings
	 *
	 * @example
	 * t.concat(input.firstName, ' ', input.lastName)
	 */
	concat(...values: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "concat",
			values: values.map((v) => this.toDescriptor(v)),
		};
	}

	/**
	 * Join array with separator
	 *
	 * @example
	 * t.join(input.tags, ', ')
	 */
	join(array: any, separator: string): TransformDescriptor {
		return {
			type: "transform",
			name: "join",
			array: this.toDescriptor(array),
			separator,
		};
	}

	/**
	 * Uppercase
	 *
	 * @example
	 * t.uppercase(input.text)
	 */
	uppercase(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "uppercase",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Lowercase
	 *
	 * @example
	 * t.lowercase(input.email)
	 */
	lowercase(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "lowercase",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Trim whitespace
	 *
	 * @example
	 * t.trim(input.text)
	 */
	trim(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "trim",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * Substring
	 *
	 * @example
	 * t.substring(input.text, 0, 10)
	 */
	substring(value: any, start: number, end?: number): TransformDescriptor {
		return {
			type: "transform",
			name: "substring",
			value: this.toDescriptor(value),
			start,
			...(end !== undefined && { end }),
		};
	}

	/**
	 * Replace
	 *
	 * @example
	 * t.replace(input.text, 'old', 'new')
	 */
	replace(value: any, search: string, replacement: string): TransformDescriptor {
		return {
			type: "transform",
			name: "replace",
			value: this.toDescriptor(value),
			search,
			replacement,
		};
	}

	/**
	 * Template string
	 *
	 * @example
	 * t.template('Hello {{name}}!', { name: input.userName })
	 */
	template(template: string, vars: Record<string, any>): TransformDescriptor {
		return {
			type: "transform",
			name: "template",
			template,
			vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, this.toDescriptor(v)])),
		};
	}

	/**
	 * String length
	 *
	 * @example
	 * t.length(input.text)
	 */
	length(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "length",
			value: this.toDescriptor(value),
		};
	}

	// ===== Array Operations =====

	/**
	 * Spread array (copy)
	 *
	 * @example
	 * t.spread(input.items)
	 */
	spread(array: any): TransformDescriptor {
		return {
			type: "transform",
			name: "spread",
			array: this.toDescriptor(array),
		};
	}

	/**
	 * Map with predefined transform
	 *
	 * @example
	 * t.map(input.tags, 'uppercase')
	 */
	map(array: any, transformName: string): TransformDescriptor {
		return {
			type: "transform",
			name: "map",
			array: this.toDescriptor(array),
			transform: transformName,
		};
	}

	/**
	 * Filter with predefined predicate
	 *
	 * @example
	 * t.filter(input.items, 'isActive')
	 */
	filter(array: any, predicateName: string): TransformDescriptor {
		return {
			type: "transform",
			name: "filter",
			array: this.toDescriptor(array),
			predicate: predicateName,
		};
	}

	/**
	 * Flatten nested arrays
	 *
	 * @example
	 * t.flatten(input.nestedArrays)
	 */
	flatten(array: any): TransformDescriptor {
		return {
			type: "transform",
			name: "flatten",
			array: this.toDescriptor(array),
		};
	}

	/**
	 * Slice array
	 *
	 * @example
	 * t.slice(input.items, 0, 10)
	 */
	slice(array: any, start: number, end?: number): TransformDescriptor {
		return {
			type: "transform",
			name: "slice",
			array: this.toDescriptor(array),
			start,
			...(end !== undefined && { end }),
		};
	}

	/**
	 * First element
	 *
	 * @example
	 * t.first(input.items)
	 */
	first(array: any): TransformDescriptor {
		return {
			type: "transform",
			name: "first",
			array: this.toDescriptor(array),
		};
	}

	/**
	 * Last element
	 *
	 * @example
	 * t.last(input.items)
	 */
	last(array: any): TransformDescriptor {
		return {
			type: "transform",
			name: "last",
			array: this.toDescriptor(array),
		};
	}

	// ===== Object Operations =====

	/**
	 * Merge objects (shallow)
	 *
	 * @example
	 * t.merge(draft.metadata, input.newMetadata)
	 */
	merge(...objects: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "merge",
			objects: objects.map((o) => this.toDescriptor(o)),
		};
	}

	/**
	 * Deep merge objects
	 *
	 * @example
	 * t.deepMerge(draft.config, input.configUpdates)
	 */
	deepMerge(...objects: any[]): TransformDescriptor {
		return {
			type: "transform",
			name: "deepMerge",
			objects: objects.map((o) => this.toDescriptor(o)),
		};
	}

	/**
	 * Pick fields
	 *
	 * @example
	 * t.pick(input.user, ['id', 'name', 'email'])
	 */
	pick(object: any, keys: string[]): TransformDescriptor {
		return {
			type: "transform",
			name: "pick",
			object: this.toDescriptor(object),
			keys,
		};
	}

	/**
	 * Omit fields
	 *
	 * @example
	 * t.omit(input.user, ['password', 'token'])
	 */
	omit(object: any, keys: string[]): TransformDescriptor {
		return {
			type: "transform",
			name: "omit",
			object: this.toDescriptor(object),
			keys,
		};
	}

	/**
	 * Object keys
	 *
	 * @example
	 * t.keys(input.metadata)
	 */
	keys(object: any): TransformDescriptor {
		return {
			type: "transform",
			name: "keys",
			object: this.toDescriptor(object),
		};
	}

	/**
	 * Object values
	 *
	 * @example
	 * t.values(input.metadata)
	 */
	values(object: any): TransformDescriptor {
		return {
			type: "transform",
			name: "values",
			object: this.toDescriptor(object),
		};
	}

	// ===== Time Operations =====

	/**
	 * Current timestamp (milliseconds)
	 *
	 * @example
	 * t.now()
	 */
	now(): TransformDescriptor {
		return { type: "transform", name: "now" };
	}

	/**
	 * ISO 8601 timestamp
	 *
	 * @example
	 * t.timestamp()
	 */
	timestamp(): TransformDescriptor {
		return { type: "transform", name: "timestamp" };
	}

	/**
	 * Unix timestamp (seconds)
	 *
	 * @example
	 * t.unixTimestamp()
	 */
	unixTimestamp(): TransformDescriptor {
		return { type: "transform", name: "unixTimestamp" };
	}

	// ===== Crypto Operations =====

	/**
	 * UUID v4
	 *
	 * @example
	 * t.uuid()
	 */
	uuid(): TransformDescriptor {
		return { type: "transform", name: "uuid" };
	}

	/**
	 * Hash value (SHA-256)
	 *
	 * @example
	 * t.hash(input.content)
	 */
	hash(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "hash",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * MD5 hash
	 *
	 * @example
	 * t.md5(input.content)
	 */
	md5(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "md5",
			value: this.toDescriptor(value),
		};
	}

	// ===== JSON Operations =====

	/**
	 * JSON stringify
	 *
	 * @example
	 * t.json(input.metadata)
	 */
	json(value: any): TransformDescriptor {
		return {
			type: "transform",
			name: "json",
			value: this.toDescriptor(value),
		};
	}

	/**
	 * JSON parse
	 *
	 * @example
	 * t.parse(input.jsonString)
	 */
	parse(jsonString: any): TransformDescriptor {
		return {
			type: "transform",
			name: "parse",
			value: this.toDescriptor(jsonString),
		};
	}

	// ===== Helper Methods =====

	/**
	 * Convert value to descriptor
	 * @private
	 */
	private toDescriptor(value: any): Descriptor {
		// Already a descriptor
		if (value && typeof value === "object" && "type" in value) {
			return value;
		}

		// Input proxy (will be implemented by OptimisticBuilder)
		if (value && typeof value === "object" && "__inputPath__" in value) {
			return {
				type: "field",
				path: value.__inputPath__,
			};
		}

		// Literal
		return {
			type: "literal",
			value,
		};
	}
}
