/**
 * @sylphx/lens-core - Compression Utilities
 *
 * Compression and decompression for large payloads during reconnection.
 * Uses native Web APIs (CompressionStream/DecompressionStream) when available,
 * falls back to no compression in environments without support.
 */

import type { CompressedPayload, CompressionAlgorithm } from "./types.js";
import { isCompressedPayload } from "./types.js";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Compression configuration.
 */
export interface CompressionConfig {
	/** Enable compression (default: true) */
	enabled: boolean;

	/** Minimum payload size to compress in bytes (default: 1024) */
	threshold: number;

	/** Preferred compression algorithm (default: "gzip") */
	algorithm: CompressionAlgorithm;
}

/**
 * Default compression configuration.
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
	enabled: true,
	threshold: 1024, // Only compress payloads > 1KB
	algorithm: "gzip",
};

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Check if compression is supported in current environment.
 */
export function isCompressionSupported(): boolean {
	return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

// =============================================================================
// Compression Functions
// =============================================================================

/**
 * Compress data if it exceeds the threshold.
 *
 * @param data - Data to compress (will be JSON stringified)
 * @param config - Compression configuration
 * @returns Compressed payload or original data if below threshold
 */
export async function compressIfNeeded<T>(
	data: T,
	config: Partial<CompressionConfig> = {},
): Promise<T | CompressedPayload> {
	const { enabled, threshold, algorithm } = { ...DEFAULT_COMPRESSION_CONFIG, ...config };

	if (!enabled) {
		return data;
	}

	const jsonString = JSON.stringify(data);
	const originalSize = new TextEncoder().encode(jsonString).length;

	// Don't compress small payloads
	if (originalSize < threshold) {
		return data;
	}

	// Check if compression is supported (Web Streams API)
	if (!isCompressionSupported()) {
		return data;
	}

	try {
		const compressed = await compress(jsonString, algorithm);
		const compressedSize = compressed.length;

		// Only use compression if it actually reduces size
		if (compressedSize >= originalSize) {
			return data;
		}

		return {
			compressed: true,
			algorithm,
			data: compressed,
			originalSize,
			compressedSize,
		};
	} catch {
		// Fall back to uncompressed on any error
		return data;
	}
}

/**
 * Decompress payload if it's compressed.
 *
 * @param payload - Possibly compressed payload
 * @returns Decompressed data
 */
export async function decompressIfNeeded<T>(payload: T | CompressedPayload): Promise<T> {
	if (!isCompressedPayload(payload)) {
		return payload as T;
	}

	try {
		const decompressed = await decompress(payload.data, payload.algorithm);
		return JSON.parse(decompressed) as T;
	} catch (error) {
		throw new Error(
			`Failed to decompress payload: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

// =============================================================================
// Low-level Compression
// =============================================================================

/**
 * Compress string to base64-encoded compressed data.
 * Uses Web Streams API (CompressionStream) - supported in modern browsers and Node.js 18+.
 */
async function compress(data: string, algorithm: CompressionAlgorithm): Promise<string> {
	if (algorithm === "none") {
		return btoa(data);
	}

	// Use Web Streams API (supported in browsers and Node.js 18+)
	if (isCompressionSupported()) {
		return compressWithStreams(data, algorithm);
	}

	// No compression available, return base64 encoded
	return btoa(data);
}

/**
 * Decompress base64-encoded compressed data to string.
 * Uses Web Streams API (DecompressionStream) - supported in modern browsers and Node.js 18+.
 */
async function decompress(data: string, algorithm: CompressionAlgorithm): Promise<string> {
	if (algorithm === "none") {
		return atob(data);
	}

	// Use Web Streams API (supported in browsers and Node.js 18+)
	if (isCompressionSupported()) {
		return decompressWithStreams(data, algorithm);
	}

	// No decompression available, assume base64 encoded
	return atob(data);
}

// =============================================================================
// Web Streams Implementation
// =============================================================================

/**
 * Compress using Web Streams API (CompressionStream).
 */
async function compressWithStreams(data: string, algorithm: CompressionAlgorithm): Promise<string> {
	const encoder = new TextEncoder();
	const inputBytes = encoder.encode(data);

	const compressionFormat = algorithm === "gzip" ? "gzip" : "deflate";
	const stream = new CompressionStream(compressionFormat);

	const writer = stream.writable.getWriter();
	writer.write(inputBytes);
	writer.close();

	const compressedChunks: Uint8Array[] = [];
	const reader = stream.readable.getReader();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		compressedChunks.push(value);
	}

	// Combine chunks
	const totalLength = compressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const compressedBytes = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of compressedChunks) {
		compressedBytes.set(chunk, offset);
		offset += chunk.length;
	}

	// Convert to base64
	return uint8ArrayToBase64(compressedBytes);
}

/**
 * Decompress using Web Streams API (DecompressionStream).
 */
async function decompressWithStreams(
	data: string,
	algorithm: CompressionAlgorithm,
): Promise<string> {
	const compressedBytes = base64ToUint8Array(data);

	const compressionFormat = algorithm === "gzip" ? "gzip" : "deflate";
	const stream = new DecompressionStream(compressionFormat);

	const writer = stream.writable.getWriter();
	writer.write(compressedBytes as unknown as Uint8Array<ArrayBuffer>);
	writer.close();

	const decompressedChunks: Uint8Array[] = [];
	const reader = stream.readable.getReader();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		decompressedChunks.push(value);
	}

	// Combine chunks
	const totalLength = decompressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const decompressedBytes = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of decompressedChunks) {
		decompressedBytes.set(chunk, offset);
		offset += chunk.length;
	}

	// Convert to string
	const decoder = new TextDecoder();
	return decoder.decode(decompressedBytes);
}

// =============================================================================
// Base64 Utilities
// =============================================================================

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	// Use btoa for browser compatibility
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Calculate compression ratio.
 */
export function getCompressionRatio(payload: CompressedPayload): number {
	if (payload.originalSize === 0) return 1;
	return payload.compressedSize / payload.originalSize;
}

/**
 * Calculate space saved by compression.
 */
export function getSpaceSaved(payload: CompressedPayload): number {
	return payload.originalSize - payload.compressedSize;
}

/**
 * Format compression stats for logging.
 */
export function formatCompressionStats(payload: CompressedPayload): string {
	const ratio = getCompressionRatio(payload);
	const saved = getSpaceSaved(payload);
	const percent = ((1 - ratio) * 100).toFixed(1);

	return `${payload.algorithm}: ${payload.originalSize}B → ${payload.compressedSize}B (${percent}% saved, ${saved}B)`;
}
