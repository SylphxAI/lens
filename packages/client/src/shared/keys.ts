/**
 * @lens/client - Shared Key Utilities
 *
 * Unified key generation for entities and queries.
 */

// =============================================================================
// Entity Keys (for store normalization)
// =============================================================================

export type EntityKey = `${string}:${string}`;

/**
 * Create entity key from type and ID
 */
export function makeEntityKey(type: string, id: string): EntityKey {
	return `${type}:${id}`;
}

/**
 * Parse entity key into type and ID
 */
export function parseEntityKey(key: EntityKey): { type: string; id: string } {
	const colonIndex = key.indexOf(":");
	if (colonIndex === -1) {
		throw new Error(`Invalid entity key: ${key}`);
	}
	return {
		type: key.slice(0, colonIndex),
		id: key.slice(colonIndex + 1),
	};
}

// =============================================================================
// Query Keys (for request deduplication)
// =============================================================================

/**
 * Create query key from operation and input
 */
export function makeQueryKey(operation: string, input: unknown): string {
	const inputStr = input !== undefined ? JSON.stringify(input) : "";
	return `${operation}:${inputStr}`;
}

/**
 * Create query key with field selection
 */
export function makeQueryKeyWithFields(
	operation: string,
	input: unknown,
	fields?: string[],
): string {
	const base = makeQueryKey(operation, input);
	if (!fields || fields.length === 0) return base;
	return `${base}:${fields.sort().join(",")}`;
}

/**
 * Parse query key into operation and input
 */
export function parseQueryKey(key: string): { operation: string; input: unknown } {
	const colonIndex = key.indexOf(":");
	if (colonIndex === -1) {
		return { operation: key, input: undefined };
	}

	const operation = key.slice(0, colonIndex);
	const rest = key.slice(colonIndex + 1);

	// Empty input
	if (!rest) {
		return { operation, input: undefined };
	}

	// Input is JSON - find where JSON ends
	// JSON objects start with { and end with matching }
	// JSON arrays start with [ and end with matching ]
	// Primitives are just the value
	let inputStr = rest;

	if (rest.startsWith("{") || rest.startsWith("[")) {
		// Count brackets to find end of JSON
		const openChar = rest[0];
		const closeChar = openChar === "{" ? "}" : "]";
		let depth = 0;
		let inString = false;
		let escape = false;

		for (let i = 0; i < rest.length; i++) {
			const char = rest[i];

			if (escape) {
				escape = false;
				continue;
			}

			if (char === "\\") {
				escape = true;
				continue;
			}

			if (char === '"') {
				inString = !inString;
				continue;
			}

			if (inString) continue;

			if (char === openChar) depth++;
			if (char === closeChar) depth--;

			if (depth === 0) {
				inputStr = rest.slice(0, i + 1);
				break;
			}
		}
	}

	if (!inputStr) {
		return { operation, input: undefined };
	}

	try {
		return {
			operation,
			input: JSON.parse(inputStr),
		};
	} catch {
		// If parsing fails, treat as undefined
		return { operation, input: undefined };
	}
}
