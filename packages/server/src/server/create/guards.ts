/**
 * @sylphx/lens-server - Create / Guards
 *
 * Pure runtime type guards used by the server executor.
 * Internal module - not part of the public API.
 */

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return value != null && typeof value === "object" && Symbol.asyncIterator in value;
}
