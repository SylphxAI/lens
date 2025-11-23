/**
 * @lens/client - HTTP Link (Terminal)
 *
 * Terminal link that executes operations via HTTP.
 */

import type { Link, LinkFn, OperationContext, OperationResult } from "./types";

export interface HttpLinkOptions {
	/** Base URL for API */
	url: string;
	/** Request headers */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Custom fetch implementation */
	fetch?: typeof fetch;
	/** Request timeout in ms */
	timeout?: number;
}

/**
 * HTTP link - terminal link for HTTP transport
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink(),
 *     httpLink({ url: "http://localhost:3000/api" }),
 *   ],
 * });
 * ```
 */
export function httpLink(options: HttpLinkOptions): Link {
	const { url, headers = {}, fetch: customFetch = fetch, timeout = 30000 } = options;

	return (): LinkFn => {
		// Terminal link - ignores next()
		return async (op, _next): Promise<OperationResult> => {
			try {
				const resolvedHeaders =
					typeof headers === "function" ? await headers() : headers;

				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				// Combine with operation signal if provided
				if (op.signal) {
					op.signal.addEventListener("abort", () => controller.abort());
				}

				const response = await customFetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...resolvedHeaders,
					},
					body: JSON.stringify({
						entity: op.entity,
						operation: op.op,
						type: op.type,
						input: op.input,
					}),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({})) as { message?: string };
					return {
						error: new Error(errorData.message || `HTTP ${response.status}`),
					};
				}

				const result = (await response.json()) as { data: unknown };
				return { data: result.data };
			} catch (error) {
				if ((error as Error).name === "AbortError") {
					return { error: new Error("Request timeout") };
				}
				return { error: error as Error };
			}
		};
	};
}

/**
 * HTTP batch link - batches multiple operations into single request
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     httpBatchLink({
 *       url: "http://localhost:3000/api/batch",
 *       maxBatchSize: 10,
 *       batchInterval: 10,
 *     }),
 *   ],
 * });
 * ```
 */
export function httpBatchLink(
	options: HttpLinkOptions & {
		/** Maximum operations per batch (default: 10) */
		maxBatchSize?: number;
		/** Time window to collect operations in ms (default: 10) */
		batchInterval?: number;
	},
): Link {
	const {
		url,
		headers = {},
		fetch: customFetch = fetch,
		timeout = 30000,
		maxBatchSize = 10,
		batchInterval = 10,
	} = options;

	// Batch state
	let pendingOps: Array<{
		op: OperationContext;
		resolve: (result: OperationResult) => void;
		reject: (error: Error) => void;
	}> = [];
	let batchTimer: ReturnType<typeof setTimeout> | null = null;

	async function executeBatch() {
		const batch = pendingOps;
		pendingOps = [];
		batchTimer = null;

		if (batch.length === 0) return;

		try {
			const resolvedHeaders =
				typeof headers === "function" ? await headers() : headers;

			const response = await customFetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...resolvedHeaders,
				},
				body: JSON.stringify(
					batch.map(({ op }) => ({
						id: op.id,
						entity: op.entity,
						operation: op.op,
						type: op.type,
						input: op.input,
					})),
				),
				signal: AbortSignal.timeout(timeout),
			});

			if (!response.ok) {
				const error = new Error(`HTTP ${response.status}`);
				for (const { reject } of batch) {
					reject(error);
				}
				return;
			}

			const results = (await response.json()) as Array<{ id: string; data?: unknown; error?: string }>;

			// Match results to operations
			for (const { op, resolve } of batch) {
				const result = results.find((r) => r.id === op.id);
				if (result?.error) {
					resolve({ error: new Error(result.error) });
				} else {
					resolve({ data: result?.data });
				}
			}
		} catch (error) {
			for (const { reject } of batch) {
				reject(error as Error);
			}
		}
	}

	return (): LinkFn => {
		return (op, _next): Promise<OperationResult> => {
			return new Promise((resolve, reject) => {
				pendingOps.push({ op, resolve, reject });

				// Execute immediately if batch is full
				if (pendingOps.length >= maxBatchSize) {
					if (batchTimer) clearTimeout(batchTimer);
					executeBatch();
				} else if (!batchTimer) {
					// Schedule batch execution
					batchTimer = setTimeout(executeBatch, batchInterval);
				}
			});
		};
	};
}
