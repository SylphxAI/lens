/**
 * @lens/client - Query Optimizer Link
 *
 * Optimizes queries by:
 * 1. Deduplicating simultaneous identical requests
 * 2. Tracking field-level cache
 * 3. Incrementally fetching only missing fields
 * 4. Deriving results from cached data when possible
 *
 * Implements the Query Optimizer pattern from ARCHITECTURE.md
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

export interface QueryOptimizerOptions {
	/** Enable query deduplication (default: true) */
	deduplication?: boolean;
	/** Enable incremental fetching (default: true) */
	incrementalFetch?: boolean;
	/** Cache TTL in ms (default: 5 minutes) */
	ttl?: number;
}

interface FieldCache {
	/** Cached field values */
	fields: Map<string, unknown>;
	/** Timestamp when cached */
	timestamp: number;
	/** Full entity data (if all fields cached) */
	fullData?: Record<string, unknown>;
}

/**
 * Query optimizer link - minimizes server requests through smart caching
 *
 * **Scenarios:**
 * 1. Full Superset: Cache has all needed fields → derive without server request
 * 2. Partial Overlap: Cache has some fields → fetch only missing, merge
 * 3. No Cache: Fetch all fields from server
 * 4. Deduplication: Multiple simultaneous requests → single server request
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     queryOptimizerLink({ incrementalFetch: true }),
 *     httpLink({ url: '/api' }),
 *   ],
 * });
 *
 * // Component A fetches some fields
 * const user1 = await client.User.get("123", {
 *   select: { name: true, email: true }
 * });
 *
 * // Component B needs more fields
 * // → Only fetches { bio }, merges with cache
 * const user2 = await client.User.get("123", {
 *   select: { name: true, email: true, bio: true }
 * });
 * ```
 */
export function queryOptimizerLink(options: QueryOptimizerOptions = {}): Link {
	const {
		deduplication = true,
		incrementalFetch = true,
		ttl = 5 * 60 * 1000,
	} = options;

	// Field-level cache: entity:id -> FieldCache
	const fieldCache = new Map<string, FieldCache>();

	// In-flight requests for deduplication
	const inFlight = new Map<string, Promise<OperationResult>>();

	return (): LinkFn => {
		return async (op, next): Promise<OperationResult> => {
			// Only optimize queries
			if (op.type !== "query") {
				// Mutations invalidate cache
				if (op.type === "mutation") {
					invalidateEntity(fieldCache, op.entity);
				}
				return next(op);
			}

			const entityKey = makeEntityKey(op);
			const requestedFields = extractFields(op);
			const now = Date.now();

			// Handle deduplication
			if (deduplication) {
				const dedupKey = makeDedupKey(op);
				const existing = inFlight.get(dedupKey);
				if (existing) {
					// Request already in flight - wait for it
					return existing;
				}
			}

			// Check field cache
			const cached = fieldCache.get(entityKey);

			if (cached && now - cached.timestamp < ttl && requestedFields) {
				const cachedFields = Array.from(cached.fields.keys());

				// Scenario 1: All fields cached (Full Superset)
				if (requestedFields.every((f) => cachedFields.includes(f))) {
					// Derive from cache - no server request
					const derivedData: Record<string, unknown> = {};
					for (const field of requestedFields) {
						derivedData[field] = cached.fields.get(field);
					}
					return {
						data: derivedData,
						meta: { fromCache: true, derived: true },
					};
				}

				// Scenario 2: Partial overlap (Incremental Fetching)
				if (incrementalFetch) {
					const missingFields = requestedFields.filter(
						(f) => !cachedFields.includes(f),
					);

					if (missingFields.length > 0 && missingFields.length < requestedFields.length) {
						// Fetch only missing fields
						const modifiedOp: OperationContext = {
							...op,
							input: {
								...(op.input as Record<string, unknown>),
								select: missingFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}),
							},
						};

						const fetchPromise = next(modifiedOp);

						if (deduplication) {
							inFlight.set(makeDedupKey(op), fetchPromise);
						}

						const result = await fetchPromise;

						if (deduplication) {
							inFlight.delete(makeDedupKey(op));
						}

						if (result.error) {
							return result;
						}

						// Merge fetched data with cache
						const fetchedData = result.data as Record<string, unknown>;
						const mergedData: Record<string, unknown> = {};

						// Add cached fields
						for (const field of requestedFields) {
							if (cachedFields.includes(field)) {
								mergedData[field] = cached.fields.get(field);
							}
						}

						// Add newly fetched fields
						for (const [key, value] of Object.entries(fetchedData)) {
							mergedData[key] = value;
							cached.fields.set(key, value);
						}

						cached.timestamp = now;

						return {
							data: mergedData,
							meta: { ...result.meta, incrementalFetch: true },
						};
					}
				}
			}

			// Scenario 3: No cache or need full fetch
			const fetchPromise = next(op);

			if (deduplication) {
				inFlight.set(makeDedupKey(op), fetchPromise);
			}

			const result = await fetchPromise;

			if (deduplication) {
				inFlight.delete(makeDedupKey(op));
			}

			// Cache result
			if (!result.error && result.data) {
				const data = result.data as Record<string, unknown>;

				if (!fieldCache.has(entityKey)) {
					fieldCache.set(entityKey, {
						fields: new Map(),
						timestamp: now,
					});
				}

				const cache = fieldCache.get(entityKey)!;

				// Update field cache
				for (const [key, value] of Object.entries(data)) {
					cache.fields.set(key, value);
				}

				// If no select specified, this is the full entity
				if (!requestedFields) {
					cache.fullData = data;
				}

				cache.timestamp = now;
			}

			return result;
		};
	};
}

// =============================================================================
// Helpers
// =============================================================================

function makeEntityKey(op: OperationContext): string {
	// For single entity queries like get(id)
	const input = op.input as { id?: string };
	if (input.id) {
		return `${op.entity}:${input.id}`;
	}
	return `${op.entity}:${op.op}`;
}

function makeDedupKey(op: OperationContext): string {
	return `${op.entity}:${op.op}:${JSON.stringify(op.input)}`;
}

function extractFields(op: OperationContext): string[] | null {
	const input = op.input as { select?: Record<string, boolean> };
	if (!input.select) {
		return null; // No select = all fields
	}
	return Object.keys(input.select);
}

function invalidateEntity(cache: Map<string, FieldCache>, entity: string): void {
	for (const key of cache.keys()) {
		if (key.startsWith(`${entity}:`)) {
			cache.delete(key);
		}
	}
}
