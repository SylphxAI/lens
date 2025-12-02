/**
 * @sylphx/lens-core - Hashing Utilities
 *
 * Fast hashing for change detection using MurmurHash3.
 * Optimized for comparing entity state without full JSON.stringify comparison.
 */

// =============================================================================
// MurmurHash3 Implementation (32-bit)
// =============================================================================

/**
 * MurmurHash3 32-bit implementation.
 * Fast, non-cryptographic hash with excellent distribution.
 *
 * @param key - String to hash
 * @param seed - Optional seed value (default: 0)
 * @returns 32-bit hash as hex string
 */
export function murmurhash3(key: string, seed = 0): string {
	const remainder = key.length % 4;
	const bytes = key.length - remainder;
	let h1 = seed;
	const c1 = 0xcc9e2d51;
	const c2 = 0x1b873593;
	let i = 0;

	while (i < bytes) {
		let k1 =
			(key.charCodeAt(i) & 0xff) |
			((key.charCodeAt(i + 1) & 0xff) << 8) |
			((key.charCodeAt(i + 2) & 0xff) << 16) |
			((key.charCodeAt(i + 3) & 0xff) << 24);

		k1 = Math.imul(k1, c1);
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = Math.imul(k1, c2);

		h1 ^= k1;
		h1 = (h1 << 13) | (h1 >>> 19);
		h1 = Math.imul(h1, 5) + 0xe6546b64;

		i += 4;
	}

	let k1 = 0;

	switch (remainder) {
		case 3:
			k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
		// falls through
		case 2:
			k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
		// falls through
		case 1:
			k1 ^= key.charCodeAt(i) & 0xff;
			k1 = Math.imul(k1, c1);
			k1 = (k1 << 15) | (k1 >>> 17);
			k1 = Math.imul(k1, c2);
			h1 ^= k1;
	}

	h1 ^= key.length;

	// Finalization mix
	h1 ^= h1 >>> 16;
	h1 = Math.imul(h1, 0x85ebca6b);
	h1 ^= h1 >>> 13;
	h1 = Math.imul(h1, 0xc2b2ae35);
	h1 ^= h1 >>> 16;

	// Convert to unsigned 32-bit and then to hex
	return (h1 >>> 0).toString(16).padStart(8, "0");
}

// =============================================================================
// Value Hashing
// =============================================================================

/**
 * Hash any value for fast comparison.
 * Uses type-specific handling for optimal performance.
 *
 * @param value - Value to hash
 * @returns Hash string
 */
export function hashValue(value: unknown): string {
	if (value === null) {
		return "n:null";
	}

	if (value === undefined) {
		return "u:undefined";
	}

	const type = typeof value;

	switch (type) {
		case "string":
			// For strings, hash directly
			return `s:${murmurhash3(value as string)}`;

		case "number":
			// Numbers: convert to string for hashing
			return `n:${murmurhash3(String(value))}`;

		case "boolean":
			return value ? "b:true" : "b:false";

		case "object":
			// Arrays and objects need JSON serialization
			// Sort object keys for consistent ordering
			return `o:${murmurhash3(stableStringify(value))}`;

		case "bigint":
			return `i:${murmurhash3(String(value))}`;

		case "symbol":
			return `y:${murmurhash3(String(value))}`;

		case "function":
			// Functions shouldn't be in state, but handle gracefully
			return `f:${murmurhash3((value as () => void).toString())}`;

		default:
			return `x:${murmurhash3(String(value))}`;
	}
}

/**
 * Stable JSON stringify with sorted keys.
 * Ensures consistent hash for equivalent objects.
 *
 * @param value - Value to stringify
 * @returns Stable JSON string
 */
export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	// Sort keys for objects
	const keys = Object.keys(value as object).sort();
	const pairs = keys.map(
		(key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
	);
	return `{${pairs.join(",")}}`;
}

// =============================================================================
// Entity State Hashing
// =============================================================================

/**
 * Hash entire entity state.
 * Optimized for comparing full entity objects.
 *
 * @param data - Entity data object
 * @returns Hash string
 */
export function hashEntityState(data: Record<string, unknown>): string {
	return `e:${murmurhash3(stableStringify(data))}`;
}

/**
 * Hash specific fields of entity state.
 * Useful for partial comparisons.
 *
 * @param data - Entity data object
 * @param fields - Fields to include in hash
 * @returns Hash string
 */
export function hashEntityFields(
	data: Record<string, unknown>,
	fields: string[]
): string {
	const subset: Record<string, unknown> = {};
	for (const field of fields.sort()) {
		if (field in data) {
			subset[field] = data[field];
		}
	}
	return `f:${murmurhash3(stableStringify(subset))}`;
}

// =============================================================================
// Hash Cache
// =============================================================================

/**
 * LRU cache for hash results.
 * Avoids recomputing hashes for unchanged values.
 */
export class HashCache {
	private cache = new Map<unknown, { hash: string; timestamp: number }>();
	private maxSize: number;
	private maxAge: number;

	constructor(maxSize = 1000, maxAge = 60000) {
		this.maxSize = maxSize;
		this.maxAge = maxAge;
	}

	/**
	 * Get cached hash or compute and cache.
	 */
	get(value: unknown): string {
		// For primitives, use direct lookup
		if (typeof value !== "object" || value === null) {
			const cached = this.cache.get(value);
			if (cached && Date.now() - cached.timestamp < this.maxAge) {
				return cached.hash;
			}
			const hash = hashValue(value);
			this.set(value, hash);
			return hash;
		}

		// For objects, we can't use Map lookup (reference equality)
		// Just compute directly
		return hashValue(value);
	}

	/**
	 * Store hash in cache.
	 */
	private set(value: unknown, hash: string): void {
		// Evict oldest if at capacity
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(value, { hash, timestamp: Date.now() });
	}

	/**
	 * Clear the cache.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics.
	 */
	getStats(): { size: number; maxSize: number } {
		return { size: this.cache.size, maxSize: this.maxSize };
	}
}

// =============================================================================
// Field Hash Map
// =============================================================================

/**
 * Per-field hash tracking for efficient change detection.
 * Stores hash of each field value to avoid deep comparison.
 */
export class FieldHashMap {
	private hashes = new Map<string, string>();

	/**
	 * Check if field value has changed and update hash.
	 * Returns true if value changed, false if unchanged.
	 *
	 * @param field - Field name
	 * @param value - New value
	 * @returns Whether the value changed
	 */
	hasChanged(field: string, value: unknown): boolean {
		const newHash = hashValue(value);
		const oldHash = this.hashes.get(field);

		if (oldHash === newHash) {
			return false;
		}

		this.hashes.set(field, newHash);
		return true;
	}

	/**
	 * Update hash without checking for change.
	 */
	update(field: string, value: unknown): void {
		this.hashes.set(field, hashValue(value));
	}

	/**
	 * Get current hash for field.
	 */
	getHash(field: string): string | undefined {
		return this.hashes.get(field);
	}

	/**
	 * Remove field hash.
	 */
	delete(field: string): void {
		this.hashes.delete(field);
	}

	/**
	 * Clear all hashes.
	 */
	clear(): void {
		this.hashes.clear();
	}

	/**
	 * Get all field hashes.
	 */
	getAll(): Map<string, string> {
		return new Map(this.hashes);
	}

	/**
	 * Get combined hash of all fields.
	 */
	getCombinedHash(): string {
		const sorted = Array.from(this.hashes.entries()).sort((a, b) =>
			a[0].localeCompare(b[0])
		);
		return murmurhash3(sorted.map(([k, v]) => `${k}:${v}`).join("|"));
	}
}

// =============================================================================
// Comparison Utilities
// =============================================================================

/**
 * Compare two values efficiently using hashes.
 * Falls back to deep comparison only if hashes differ but might be collision.
 *
 * @param a - First value
 * @param b - Second value
 * @param aHash - Pre-computed hash of a (optional)
 * @param bHash - Pre-computed hash of b (optional)
 * @returns Whether values are equal
 */
export function valuesEqual(
	a: unknown,
	b: unknown,
	aHash?: string,
	bHash?: string
): boolean {
	// Fast path: reference equality
	if (a === b) {
		return true;
	}

	// Fast path: type mismatch
	if (typeof a !== typeof b) {
		return false;
	}

	// Primitives: direct comparison
	if (typeof a !== "object" || a === null) {
		return a === b;
	}

	// Objects: use hash comparison
	const hashA = aHash ?? hashValue(a);
	const hashB = bHash ?? hashValue(b);

	return hashA === hashB;
}

/**
 * Deep equality check (fallback for when hash comparison is inconclusive).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object" || a === null || b === null) return false;

	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) return false;
		}
		return true;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b as object);
	if (keysA.length !== keysB.length) return false;

	for (const key of keysA) {
		if (
			!Object.prototype.hasOwnProperty.call(b, key) ||
			!deepEqual(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key]
			)
		) {
			return false;
		}
	}

	return true;
}
