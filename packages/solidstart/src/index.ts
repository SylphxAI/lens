/**
 * @sylphx/lens-solidstart
 *
 * SolidStart integration for Lens API framework.
 * Provides SSR-safe primitives with cache and createAsync patterns.
 *
 * @example
 * ```tsx
 * // src/routes/users/[id].tsx
 * import { createLensQuery, createLensMutation } from '@sylphx/lens-solidstart';
 * import { client } from '~/lib/lens';
 *
 * export default function UserPage() {
 *   const params = useParams();
 *   const user = createLensQuery(() => client.user.get({ id: params.id }));
 *
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <Show when={user()}>{(u) => <h1>{u().name}</h1>}</Show>
 *     </Suspense>
 *   );
 * }
 * ```
 */

// Re-export Solid primitives and context
export {
	LensProvider,
	useLensClient,
	createQuery,
	createLazyQuery,
	createMutation,
	type LensProviderProps,
	type QueryInput,
	type CreateQueryResult,
	type CreateLazyQueryResult,
	type CreateMutationResult,
	type CreateQueryOptions,
	type MutationFn,
} from "@sylphx/lens-solid";

// Re-export client utilities
export { createClient, http, ws, route } from "@sylphx/lens-client";
export type {
	LensClientConfig,
	QueryResult,
	MutationResult,
	Transport,
} from "@sylphx/lens-client";

// =============================================================================
// SolidStart-Specific Primitives
// =============================================================================

import type { QueryResult, MutationResult } from "@sylphx/lens-client";
import { createSignal, createResource, type Accessor } from "solid-js";

/**
 * SolidStart-optimized query with automatic SSR support.
 *
 * Uses createResource under the hood for streaming SSR support.
 *
 * @example
 * ```tsx
 * import { createLensQuery } from '@sylphx/lens-solidstart';
 *
 * function UserProfile(props: { userId: string }) {
 *   const user = createLensQuery(() => client.user.get({ id: props.userId }));
 *
 *   return (
 *     <Suspense fallback={<Spinner />}>
 *       <Show when={user()}>{(u) => <h1>{u().name}</h1>}</Show>
 *     </Suspense>
 *   );
 * }
 * ```
 */
export function createLensQuery<T>(
	queryFn: () => QueryResult<T>,
	options?: CreateLensQueryOptions,
): Accessor<T | undefined> {
	const [resource] = createResource(
		() => !options?.skip,
		async (shouldFetch) => {
			if (!shouldFetch) return undefined;
			const query = queryFn();
			return await query;
		},
	);

	return resource;
}

export interface CreateLensQueryOptions {
	/** Skip the query */
	skip?: boolean;
	/** Defer loading for streaming SSR */
	deferStream?: boolean;
}

/**
 * SolidStart-optimized mutation.
 *
 * @example
 * ```tsx
 * import { createLensMutation } from '@sylphx/lens-solidstart';
 *
 * function CreatePostForm() {
 *   const createPost = createLensMutation(client.post.create);
 *
 *   const handleSubmit = async (e: Event) => {
 *     e.preventDefault();
 *     const form = e.target as HTMLFormElement;
 *     const formData = new FormData(form);
 *
 *     await createPost.mutate({
 *       title: formData.get('title') as string,
 *       content: formData.get('content') as string,
 *     });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="title" />
 *       <textarea name="content" />
 *       <button disabled={createPost.pending()}>
 *         {createPost.pending() ? 'Creating...' : 'Create'}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
export function createLensMutation<TInput, TOutput>(
	mutationFn: (input: TInput) => Promise<MutationResult<TOutput>>,
): CreateLensMutationResult<TInput, TOutput> {
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<Error | null>(null);
	const [data, setData] = createSignal<TOutput | null>(null);

	const mutate = async (input: TInput): Promise<MutationResult<TOutput>> => {
		setPending(true);
		setError(null);

		try {
			const result = await mutationFn(input);
			setData(() => result.data);
			return result;
		} catch (err) {
			const mutationError = err instanceof Error ? err : new Error(String(err));
			setError(() => mutationError);
			throw mutationError;
		} finally {
			setPending(false);
		}
	};

	const reset = () => {
		setPending(false);
		setError(null);
		setData(null);
	};

	return {
		mutate,
		pending,
		error,
		data,
		reset,
	};
}

export interface CreateLensMutationResult<TInput, TOutput> {
	mutate: (input: TInput) => Promise<MutationResult<TOutput>>;
	pending: Accessor<boolean>;
	error: Accessor<Error | null>;
	data: Accessor<TOutput | null>;
	reset: () => void;
}

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Create a cached server function for SolidStart.
 *
 * Use this with SolidStart's cache() for optimal SSR performance.
 *
 * @example
 * ```ts
 * // src/lib/queries.ts
 * import { cache } from '@solidjs/router';
 * import { createServerQuery } from '@sylphx/lens-solidstart';
 * import { serverClient } from './server';
 *
 * export const getUser = cache(
 *   createServerQuery((id: string) => serverClient.user.get({ id })),
 *   'user'
 * );
 *
 * // src/routes/users/[id].tsx
 * import { getUser } from '~/lib/queries';
 *
 * export const route = {
 *   load: ({ params }) => getUser(params.id),
 * };
 *
 * export default function UserPage() {
 *   const params = useParams();
 *   const user = createAsync(() => getUser(params.id));
 *   // ...
 * }
 * ```
 */
export function createServerQuery<TArgs extends unknown[], TResult>(
	queryFn: (...args: TArgs) => QueryResult<TResult>,
): (...args: TArgs) => Promise<TResult> {
	return async (...args: TArgs): Promise<TResult> => {
		const query = queryFn(...args);
		return await query;
	};
}

/**
 * Create a server action for SolidStart mutations.
 *
 * @example
 * ```ts
 * // src/lib/actions.ts
 * import { action } from '@solidjs/router';
 * import { createServerAction } from '@sylphx/lens-solidstart';
 * import { serverClient } from './server';
 *
 * export const createPost = action(
 *   createServerAction(async (formData: FormData) => {
 *     const title = formData.get('title') as string;
 *     const content = formData.get('content') as string;
 *     return serverClient.post.create({ title, content });
 *   }),
 *   'createPost'
 * );
 * ```
 */
export function createServerAction<TInput, TOutput>(
	actionFn: (input: TInput) => Promise<MutationResult<TOutput>>,
): (input: TInput) => Promise<TOutput> {
	return async (input: TInput): Promise<TOutput> => {
		const result = await actionFn(input);
		return result.data;
	};
}
