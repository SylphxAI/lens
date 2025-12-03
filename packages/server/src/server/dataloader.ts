/**
 * @sylphx/lens-server - DataLoader
 *
 * Simple batching utility for N+1 prevention in field resolution.
 * Batches multiple load calls within a single microtask.
 */

/**
 * DataLoader batches multiple load calls within a single microtask.
 * Used internally for efficient field resolution.
 */
export class DataLoader<K, V> {
	private batch: Map<K, { resolve: (v: V | null) => void; reject: (e: Error) => void }[]> =
		new Map();
	private scheduled = false;

	constructor(private batchFn: (keys: K[]) => Promise<(V | null)[]>) {}

	async load(key: K): Promise<V | null> {
		return new Promise((resolve, reject) => {
			const existing = this.batch.get(key);
			if (existing) {
				existing.push({ resolve, reject });
			} else {
				this.batch.set(key, [{ resolve, reject }]);
			}

			if (!this.scheduled) {
				this.scheduled = true;
				queueMicrotask(() => this.flush());
			}
		});
	}

	private async flush(): Promise<void> {
		this.scheduled = false;
		const batch = this.batch;
		this.batch = new Map();

		const keys = Array.from(batch.keys());
		if (keys.length === 0) return;

		try {
			const results = await this.batchFn(keys);
			let i = 0;
			for (const [_key, callbacks] of batch) {
				const result = results[i++];
				for (const { resolve } of callbacks) {
					resolve(result);
				}
			}
		} catch (error) {
			for (const [, callbacks] of batch) {
				for (const { reject } of callbacks) {
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			}
		}
	}
}
