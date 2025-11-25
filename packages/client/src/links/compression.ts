/**
 * @sylphx/client - Compression Link
 *
 * Middleware that compresses request/response bodies using gzip or brotli.
 * Reduces bandwidth usage for large payloads.
 */

import type { Link, OperationContext, OperationResult } from "./types";

export interface CompressionLinkOptions {
	/**
	 * Compression algorithm to use
	 * @default 'gzip'
	 */
	algorithm?: "gzip" | "brotli";

	/**
	 * Minimum payload size (in bytes) to compress
	 * Payloads smaller than this won't be compressed
	 * @default 1024 (1KB)
	 */
	threshold?: number;

	/**
	 * Compression level (0-9 for gzip, 0-11 for brotli)
	 * Higher = better compression but slower
	 * @default 6
	 */
	level?: number;

	/**
	 * Whether to compress requests
	 * @default true
	 */
	compressRequests?: boolean;

	/**
	 * Whether to decompress responses
	 * @default true
	 */
	decompressResponses?: boolean;
}

/**
 * Compression link - compresses requests and decompresses responses
 *
 * Reduces bandwidth by compressing large payloads. Only compresses when
 * the payload size exceeds the threshold.
 *
 * **Note**: Requires Node.js or browser with CompressionStream API.
 * In Node.js, uses built-in zlib module.
 *
 * @example
 * ```typescript
 * import { createClient, compressionLink, httpLink } from '@sylphx/client';
 *
 * const client = createClient({
 *   links: [
 *     compressionLink({
 *       algorithm: 'gzip',
 *       threshold: 1024, // Only compress payloads > 1KB
 *       level: 6,
 *     }),
 *     httpLink({ url: '/api' }),
 *   ],
 * });
 * ```
 */
export function compressionLink(options: CompressionLinkOptions = {}): Link {
	const {
		algorithm = "gzip",
		threshold = 1024,
		level = 6,
		compressRequests = true,
		decompressResponses = true,
	} = options;

	return () => {
		return async (op, next) => {
			let modifiedOp = op;

			// Compress request if enabled
			if (compressRequests && shouldCompress(op)) {
				modifiedOp = await compressOperation(op, algorithm, level, threshold);
			}

			// Execute next link
			const result = await next(modifiedOp);

			// Decompress response if enabled
			if (decompressResponses && isCompressed(result)) {
				return await decompressResult(result, algorithm);
			}

			return result;
		};
	};
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if operation should be compressed
 */
function shouldCompress(op: OperationContext): boolean {
	// Only compress mutations (queries are usually small)
	return op.type === "mutation";
}

/**
 * Check if result is compressed
 */
function isCompressed(result: OperationResult): boolean {
	return result.meta?.compressed === true;
}

/**
 * Compress operation input
 */
async function compressOperation(
	op: OperationContext,
	algorithm: "gzip" | "brotli",
	level: number,
	threshold: number,
): Promise<OperationContext> {
	try {
		// Serialize input
		const inputJson = JSON.stringify(op.input);
		const inputSize = new Blob([inputJson]).size;

		// Skip compression if below threshold
		if (inputSize < threshold) {
			return op;
		}

		// Compress the input
		const compressed = await compress(inputJson, algorithm, level);

		// Return modified operation with compressed input
		return {
			...op,
			input: compressed,
			meta: {
				...op.meta,
				compressed: true,
				compressionAlgorithm: algorithm,
				originalSize: inputSize,
				compressedSize: compressed.byteLength,
			},
		};
	} catch (error) {
		// If compression or serialization fails, return original operation
		console.warn("Compression failed, sending uncompressed:", error);
		return op;
	}
}

/**
 * Decompress operation result
 */
async function decompressResult(
	result: OperationResult,
	algorithm: "gzip" | "brotli",
): Promise<OperationResult> {
	try {
		// Get compressed data
		const compressed = result.data as ArrayBuffer;

		// Decompress
		const decompressed = await decompress(compressed, algorithm);

		// Parse JSON
		const data = JSON.parse(decompressed);

		return {
			...result,
			data,
			meta: {
				...result.meta,
				decompressed: true,
			},
		};
	} catch (error) {
		console.error("Decompression failed:", error);
		return {
			...result,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

/**
 * Compress data using specified algorithm
 */
async function compress(
	data: string,
	algorithm: "gzip" | "brotli",
	level: number,
): Promise<ArrayBuffer> {
	// Browser environment with CompressionStream API (only supports gzip/deflate)
	if (typeof CompressionStream !== "undefined" && algorithm === "gzip") {
		const stream = new CompressionStream(algorithm as CompressionFormat);
		const writer = stream.writable.getWriter();
		const reader = stream.readable.getReader();

		// Write data
		writer.write(new TextEncoder().encode(data));
		writer.close();

		// Read compressed chunks
		const chunks: Uint8Array[] = [];
		let result = await reader.read();

		while (!result.done) {
			chunks.push(result.value);
			result = await reader.read();
		}

		// Combine chunks
		const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;

		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}

		return combined.buffer;
	}

	// Node.js environment
	if (typeof process !== "undefined" && process.versions?.node) {
		const zlib = await import("zlib");
		const { promisify } = await import("util");

		const buffer = Buffer.from(data, "utf-8");

		if (algorithm === "gzip") {
			const gzip = promisify(zlib.gzip);
			const compressed = await gzip(buffer, { level });
			return compressed.buffer as ArrayBuffer;
		} else {
			const brotli = promisify(zlib.brotliCompress);
			const compressed = await brotli(buffer, {
				params: {
					[zlib.constants.BROTLI_PARAM_QUALITY]: level,
				},
			});
			return compressed.buffer as ArrayBuffer;
		}
	}

	throw new Error("Compression not supported in this environment");
}

/**
 * Decompress data using specified algorithm
 */
async function decompress(data: ArrayBuffer, algorithm: "gzip" | "brotli"): Promise<string> {
	// Browser environment with DecompressionStream API (only supports gzip/deflate)
	if (typeof DecompressionStream !== "undefined" && algorithm === "gzip") {
		const stream = new DecompressionStream(algorithm as CompressionFormat);
		const writer = stream.writable.getWriter();
		const reader = stream.readable.getReader();

		// Write compressed data
		writer.write(new Uint8Array(data));
		writer.close();

		// Read decompressed chunks
		const chunks: Uint8Array[] = [];
		let result = await reader.read();

		while (!result.done) {
			chunks.push(result.value);
			result = await reader.read();
		}

		// Combine chunks
		const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;

		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}

		return new TextDecoder().decode(combined);
	}

	// Node.js environment
	if (typeof process !== "undefined" && process.versions?.node) {
		const zlib = await import("zlib");
		const { promisify } = await import("util");

		const buffer = Buffer.from(data);

		if (algorithm === "gzip") {
			const gunzip = promisify(zlib.gunzip);
			const decompressed = await gunzip(buffer);
			return decompressed.toString("utf-8");
		} else {
			const brotli = promisify(zlib.brotliDecompress);
			const decompressed = await brotli(buffer);
			return decompressed.toString("utf-8");
		}
	}

	throw new Error("Decompression not supported in this environment");
}
