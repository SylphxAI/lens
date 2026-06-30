/**
 * @sylphx/lens-server - Create / Field Loader
 *
 * Field-resolution batching seam: lazily creates a request-scoped DataLoader
 * for a given entity field so concurrent parents are batched without context
 * leak across requests.
 * Internal module - not part of the public API.
 */

import type { ResolverDef } from "@sylphx/lens-core";
import { DataLoader } from "../dataloader.js";

export function getOrCreateLoaderForField<TContext>(
	loaderKey: string,
	resolverDef: ResolverDef<any, any, any>,
	fieldName: string,
	context: TContext,
	loaders: Map<string, DataLoader<unknown, unknown>>,
): DataLoader<unknown, unknown> {
	let loader = loaders.get(loaderKey);
	if (!loader) {
		// Create loader with current request's context
		// Using request-scoped loaders map ensures context isolation between concurrent requests
		loader = new DataLoader(async (parents: unknown[]) => {
			const results: unknown[] = [];
			for (const parent of parents) {
				try {
					const result = await resolverDef.resolveField(
						fieldName,
						parent as Record<string, unknown>,
						{},
						context,
					);
					results.push(result);
				} catch {
					results.push(null);
				}
			}
			return results;
		});
		loaders.set(loaderKey, loader);
	}
	return loader;
}
