/**
 * @lens/client - Deserialize Link
 *
 * Automatically deserializes data from server (ISO string → Date, string → Decimal, etc.)
 * Inverse of server-side serialization.
 */

import type { Schema, SchemaDefinition, FieldType } from "@lens/core";
import type { Link, LinkFn, OperationResult } from "./types";

export interface DeserializeLinkOptions<S extends SchemaDefinition> {
	/** Schema (for type information) */
	schema: Schema<S>;
}

/**
 * Deserialize link - auto-deserializes data coming from server
 *
 * **Design Rationale:**
 * - Server serializes: Date → ISO string, Decimal → string
 * - Client deserializes: ISO string → Date, string → Decimal
 * - Transparent: Users work with native types (Date objects), not strings
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     deserializeLink({ schema }),  // ✅ Add before httpLink
 *     httpLink({ url }),
 *   ],
 * });
 *
 * // Server sends: { createdAt: "2024-01-15T00:00:00.000Z" }
 * // Client receives: { createdAt: Date(2024-01-15) }
 * const post = await client.Post.get('123')
 * console.log(post.createdAt instanceof Date) // true
 * ```
 */
export function deserializeLink<S extends SchemaDefinition>(
	options: DeserializeLinkOptions<S>,
): Link {
	const { schema } = options;

	return (): LinkFn => {
		return async (op, next) => {
			// Get result from downstream links
			const result = await next(op);

			// If error, return as-is
			if (result.error || !result.data) {
				return result;
			}

			// Deserialize data based on operation type
			try {
				const entityName = op.entity as keyof S & string;
				const entityDef = schema.definition[entityName];

				if (!entityDef) {
					// Entity not in schema - return as-is
					return result;
				}

				// Deserialize based on operation type
				let deserializedData: unknown;

				if (op.op === "list" && Array.isArray(result.data)) {
					// List operation - deserialize array
					deserializedData = result.data.map((item) =>
						deserializeEntity(entityName, item, entityDef),
					);
				} else if (result.data && typeof result.data === "object") {
					// Single entity operation - deserialize object
					deserializedData = deserializeEntity(entityName, result.data as Record<string, unknown>, entityDef);
				} else {
					// Primitive or null - return as-is
					deserializedData = result.data;
				}

				return {
					...result,
					data: deserializedData,
				};
			} catch (error) {
				console.warn("Deserialization failed:", error);
				// On error, return original data (better than throwing)
				return result;
			}
		};
	};
}

/**
 * Deserialize a single entity
 *
 * Note: Only deserializes scalar fields. Relations are left as-is (they'll be
 * deserialized when fetched through their own queries).
 */
function deserializeEntity<S extends SchemaDefinition>(
	entityName: keyof S & string,
	data: Record<string, unknown>,
	entityDef: S[keyof S],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [fieldName, value] of Object.entries(data)) {
		const fieldType = entityDef[fieldName] as FieldType | undefined;

		if (!fieldType) {
			// Field not in schema (extra data) - keep as-is
			result[fieldName] = value;
			continue;
		}

		// Handle null/undefined
		if (value === null || value === undefined) {
			result[fieldName] = value;
			continue;
		}

		// Relations: Don't deserialize nested objects to avoid issues
		// They will be deserialized when fetched through their own queries
		if (fieldType._type === "hasMany" || fieldType._type === "belongsTo" || fieldType._type === "hasOne") {
			result[fieldName] = value;
			continue;
		}

		// Arrays and objects: pass through
		if (fieldType._type === "array" || fieldType._type === "object") {
			result[fieldName] = value;
			continue;
		}

		// Scalar field - call deserialize() if method exists
		if (typeof fieldType.deserialize === "function") {
			try {
				result[fieldName] = fieldType.deserialize(value as never);
			} catch (error) {
				// If deserialization fails, log warning and use original value
				console.warn(`Failed to deserialize field ${String(entityName)}.${fieldName}:`, error);
				result[fieldName] = value;
			}
		} else {
			result[fieldName] = value;
		}
	}

	return result;
}
