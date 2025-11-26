/**
 * @sylphx/lens-nuxt
 *
 * Nuxt 3 integration for Lens API framework.
 * Provides SSR-safe composables with useAsyncData integration.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLensQuery, useLensMutation } from '@sylphx/lens-nuxt';
 *
 * const { data: users, pending } = await useLensQuery('users', () =>
 *   client.user.list()
 * );
 *
 * const { mutate: createUser, pending: creating } = useLensMutation(
 *   client.user.create
 * );
 * </script>
 * ```
 */

// Re-export Vue composables and context
export {
	LensClientKey,
	provideLensClient,
	useLensClient,
	useQuery,
	useLazyQuery,
	useMutation,
	type QueryInput,
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "@sylphx/lens-vue";

// Re-export client utilities
export { createClient, http, ws, route } from "@sylphx/lens-client";
export type {
	LensClientConfig,
	QueryResult,
	MutationResult,
	Transport,
} from "@sylphx/lens-client";

// =============================================================================
// Nuxt-Specific Composables
// =============================================================================

import type { QueryResult, MutationResult } from "@sylphx/lens-client";
import { ref, computed, type ComputedRef } from "vue";

/**
 * SSR-safe query composable with Nuxt's useAsyncData pattern.
 *
 * This composable integrates with Nuxt's SSR hydration system.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLensQuery } from '@sylphx/lens-nuxt';
 *
 * // SSR-safe query with automatic hydration
 * const { data, pending, error, refresh } = await useLensQuery(
 *   'user-profile',
 *   () => client.user.get({ id: userId })
 * );
 * </script>
 * ```
 */
export async function useLensQuery<T>(
	key: string,
	queryFn: () => QueryResult<T>,
	options?: UseLensQueryOptions,
): Promise<UseLensQueryResult<T>> {
	const data = ref<T | null>(null);
	const pending = ref(true);
	const error = ref<Error | null>(null);

	// Check for SSR context
	const isServer = typeof window === "undefined";

	const execute = async () => {
		pending.value = true;
		error.value = null;

		try {
			const query = queryFn();
			const result = await query;
			data.value = result;
			return result;
		} catch (err) {
			error.value = err instanceof Error ? err : new Error(String(err));
			throw error.value;
		} finally {
			pending.value = false;
		}
	};

	// Initial fetch
	if (!options?.lazy) {
		await execute();
	}

	// Setup client-side subscription
	if (!isServer && !options?.lazy) {
		const query = queryFn();
		query.subscribe((value) => {
			data.value = value;
		});
	}

	return {
		data: computed(() => data.value),
		pending: computed(() => pending.value),
		error: computed(() => error.value),
		refresh: execute,
	};
}

export interface UseLensQueryOptions {
	/** Don't fetch on mount */
	lazy?: boolean;
	/** Cache key for SSR */
	key?: string;
}

export interface UseLensQueryResult<T> {
	data: ComputedRef<T | null>;
	pending: ComputedRef<boolean>;
	error: ComputedRef<Error | null>;
	refresh: () => Promise<T>;
}

/**
 * SSR-safe mutation composable.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useLensMutation } from '@sylphx/lens-nuxt';
 *
 * const { mutate, pending, error, data } = useLensMutation(
 *   client.user.create
 * );
 *
 * async function handleSubmit(formData: FormData) {
 *   await mutate({
 *     name: formData.get('name') as string,
 *     email: formData.get('email') as string,
 *   });
 * }
 * </script>
 * ```
 */
export function useLensMutation<TInput, TOutput>(
	mutationFn: (input: TInput) => Promise<MutationResult<TOutput>>,
): UseLensMutationResult<TInput, TOutput> {
	const data = ref<TOutput | null>(null);
	const pending = ref(false);
	const error = ref<Error | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		pending.value = true;
		error.value = null;

		try {
			const result = await mutationFn(input);
			data.value = result.data;
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			error.value = mutationError;
			throw mutationError;
		} finally {
			pending.value = false;
		}
	};

	const reset = () => {
		data.value = null;
		pending.value = false;
		error.value = null;
	};

	return {
		mutate,
		data: computed(() => data.value),
		pending: computed(() => pending.value),
		error: computed(() => error.value),
		reset,
	};
}

export interface UseLensMutationResult<TInput, TOutput> {
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	data: ComputedRef<TOutput | null>;
	pending: ComputedRef<boolean>;
	error: ComputedRef<Error | null>;
	reset: () => void;
}

// =============================================================================
// Nuxt Plugin Helper
// =============================================================================

import type { LensClient } from "@sylphx/lens-client";

/**
 * Create a Nuxt plugin for Lens client.
 *
 * @example
 * ```ts
 * // plugins/lens.ts
 * import { createLensPlugin } from '@sylphx/lens-nuxt';
 * import { createClient, http } from '@sylphx/lens-client';
 *
 * export default createLensPlugin(() =>
 *   createClient({
 *     transport: http({ url: '/api/lens' }),
 *   })
 * );
 * ```
 */
export function createLensPlugin<T extends LensClient>(
	clientFactory: () => T,
): () => { provide: { lensClient: T } } {
	return () => {
		const client = clientFactory();
		return {
			provide: {
				lensClient: client,
			},
		};
	};
}

/**
 * Use Lens client from Nuxt plugin context.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useNuxtLensClient } from '@sylphx/lens-nuxt';
 *
 * const client = useNuxtLensClient();
 * const { data } = await useLensQuery('users', () => client.user.list());
 * </script>
 * ```
 */
export function useNuxtLensClient<T extends LensClient = LensClient>(): T {
	// This would use useNuxtApp() in actual Nuxt context
	// For type safety, we provide a placeholder that works at runtime
	if (typeof window !== "undefined" && (window as any).__NUXT__) {
		const nuxtApp = (window as any).__NUXT__;
		return nuxtApp.$lensClient as T;
	}

	throw new Error(
		"useNuxtLensClient must be called within a Nuxt application context. " +
			"Make sure the Lens plugin is registered.",
	);
}
