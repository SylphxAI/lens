/**
 * @sylphx/lens-client - MessagePack Serialization Link
 *
 * Middleware that uses MessagePack for binary serialization instead of JSON.
 * Provides smaller payloads and better performance than JSON, especially for
 * binary data, timestamps, and large datasets.
 */

import { decode, encode } from "@msgpack/msgpack";
import type { Link } from "./types";

export interface MsgpackLinkOptions {
	/**
	 * Whether to serialize requests
	 * @default true
	 */
	serializeRequests?: boolean;

	/**
	 * Whether to deserialize responses
	 * @default true
	 */
	deserializeResponses?: boolean;

	/**
	 * Whether to use binary mode
	 * When true, sends as ArrayBuffer. When false, sends as base64 string.
	 * @default true
	 */
	binaryMode?: boolean;
}

/**
 * MessagePack serialization link - uses msgpack instead of JSON
 *
 * Benefits over JSON:
 * - Smaller payload size (20-50% reduction)
 * - Faster serialization/deserialization
 * - Native support for binary data, dates, and typed arrays
 * - Preserves data types better than JSON
 *
 * **Note**: Server must also support msgpack deserialization.
 *
 * @example
 * ```typescript
 * import { createClient, msgpackLink, httpLink } from '@sylphx/lens-client';
 *
 * const client = createClient({
 *   links: [
 *     msgpackLink({ binaryMode: true }),
 *     httpLink({ url: '/api' }),
 *   ],
 * });
 * ```
 *
 * @example With compression (compress after serialization)
 * ```typescript
 * const client = createClient({
 *   links: [
 *     msgpackLink(),           // Serialize to msgpack first
 *     compressionLink(),       // Then compress if needed
 *     httpLink({ url: '/api' }),
 *   ],
 * });
 * ```
 */
export function msgpackLink(options: MsgpackLinkOptions = {}): Link {
	const { serializeRequests = true, deserializeResponses = true, binaryMode = true } = options;

	return () => {
		return async (op, next) => {
			let modifiedOp = op;

			// Serialize request with msgpack
			if (serializeRequests) {
				try {
					// Encode input to msgpack
					const encoded = encode(op.input);

					// Convert to base64 if not binary mode
					const serialized = binaryMode ? encoded.buffer : Buffer.from(encoded).toString("base64");

					modifiedOp = {
						...op,
						input: serialized,
						meta: {
							...op.meta,
							serialization: "msgpack",
							binaryMode,
						},
					};
				} catch (error) {
					console.warn("MessagePack serialization failed, using original:", error);
				}
			}

			// Execute next link
			const result = await next(modifiedOp);

			// Deserialize response with msgpack
			if (deserializeResponses && result.meta?.serialization === "msgpack") {
				try {
					let buffer: Uint8Array;

					// Handle Uint8Array, ArrayBuffer, and base64
					if (result.data instanceof Uint8Array) {
						buffer = result.data;
					} else if (result.data instanceof ArrayBuffer) {
						buffer = new Uint8Array(result.data);
					} else if (typeof result.data === "string") {
						// Assume base64
						buffer = new Uint8Array(Buffer.from(result.data, "base64"));
					} else {
						return result;
					}

					// Decode msgpack
					const decoded = decode(buffer);

					return {
						...result,
						data: decoded,
						meta: {
							...result.meta,
							deserialized: true,
						},
					};
				} catch (error) {
					console.error("MessagePack deserialization failed:", error);
					return {
						...result,
						error: error instanceof Error ? error : new Error(String(error)),
					};
				}
			}

			return result;
		};
	};
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Serialize data to msgpack
 *
 * @example
 * ```typescript
 * const data = { name: 'John', age: 30, timestamp: new Date() };
 * const encoded = serializeMsgpack(data);
 * ```
 */
export function serializeMsgpack(data: unknown): Uint8Array {
	return encode(data);
}

/**
 * Deserialize msgpack data
 *
 * @example
 * ```typescript
 * const buffer = serializeMsgpack({ name: 'John' });
 * const data = deserializeMsgpack(buffer);
 * console.log(data); // { name: 'John' }
 * ```
 */
export function deserializeMsgpack(buffer: Uint8Array | ArrayBuffer): unknown {
	const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
	return decode(uint8Array);
}

/**
 * Compare sizes: JSON vs MessagePack
 *
 * @example
 * ```typescript
 * const data = { name: 'John', values: [1, 2, 3, 4, 5] };
 * const comparison = compareSizes(data);
 * console.log(comparison);
 * // {
 * //   json: 45,
 * //   msgpack: 28,
 * //   reduction: '37.8%',
 * //   smaller: 'msgpack'
 * // }
 * ```
 */
export function compareSizes(data: unknown): {
	json: number;
	msgpack: number;
	reduction: string;
	smaller: "json" | "msgpack";
} {
	const jsonSize = new Blob([JSON.stringify(data)]).size;
	const msgpackSize = encode(data).byteLength;

	const smaller = msgpackSize < jsonSize ? "msgpack" : "json";
	const reduction =
		smaller === "msgpack"
			? `${(((jsonSize - msgpackSize) / jsonSize) * 100).toFixed(1)}%`
			: `${(((msgpackSize - jsonSize) / msgpackSize) * 100).toFixed(1)}%`;

	return {
		json: jsonSize,
		msgpack: msgpackSize,
		reduction,
		smaller,
	};
}
