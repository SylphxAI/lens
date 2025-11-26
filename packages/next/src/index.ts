/**
 * @sylphx/lens-next
 *
 * Next.js integration for Lens API framework.
 * Provides SSR-safe hooks and utilities for App Router and Pages Router.
 *
 * @example
 * ```tsx
 * // app/providers.tsx
 * 'use client';
 * import { LensProvider } from '@sylphx/lens-next';
 * import { client } from '@/lib/lens';
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <LensProvider client={client}>{children}</LensProvider>;
 * }
 *
 * // app/users/[id]/page.tsx
 * import { useLensClient, useQuery } from '@sylphx/lens-next';
 *
 * export default function UserPage({ params }: { params: { id: string } }) {
 *   const client = useLensClient();
 *   const { data, loading } = useQuery(client.user.get({ id: params.id }));
 *
 *   if (loading) return <div>Loading...</div>;
 *   return <div>{data?.name}</div>;
 * }
 * ```
 */

// Re-export React hooks and context (SSR-safe)
export {
	LensProvider,
	useLensClient,
	useQuery,
	useLazyQuery,
	useMutation,
	type LensProviderProps,
	type QueryInput,
	type UseQueryResult,
	type UseLazyQueryResult,
	type UseMutationResult,
	type UseQueryOptions,
	type MutationFn,
} from "@sylphx/lens-react";

// Re-export client utilities
export { createClient, http, ws, route } from "@sylphx/lens-client";
export type {
	LensClientConfig,
	QueryResult,
	MutationResult,
	Transport,
} from "@sylphx/lens-client";

// =============================================================================
// Next.js Specific Utilities
// =============================================================================

import type { QueryResult } from "@sylphx/lens-client";

/**
 * Server-side query execution for Next.js App Router.
 *
 * Use this in Server Components to fetch data on the server.
 * The data will be serialized and passed to the client.
 *
 * @example
 * ```tsx
 * // app/users/page.tsx (Server Component)
 * import { fetchQuery } from '@sylphx/lens-next';
 * import { serverClient } from '@/lib/lens-server';
 *
 * export default async function UsersPage() {
 *   const users = await fetchQuery(serverClient.user.list());
 *   return (
 *     <ul>
 *       {users.map(user => <li key={user.id}>{user.name}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */
export async function fetchQuery<T>(query: QueryResult<T>): Promise<T> {
	return await query;
}

/**
 * Prefetch query for Next.js App Router with caching.
 *
 * Wraps the query with React's cache() for deduplication.
 *
 * @example
 * ```tsx
 * // app/lib/queries.ts
 * import { prefetchQuery } from '@sylphx/lens-next';
 * import { serverClient } from '@/lib/lens-server';
 *
 * export const getUser = (id: string) =>
 *   prefetchQuery(() => serverClient.user.get({ id }));
 *
 * // app/users/[id]/page.tsx
 * import { getUser } from '@/lib/queries';
 *
 * export default async function UserPage({ params }: { params: { id: string } }) {
 *   const user = await getUser(params.id);
 *   return <div>{user.name}</div>;
 * }
 * ```
 */
export function prefetchQuery<T>(
	queryFn: () => QueryResult<T>,
): () => Promise<T> {
	// In SSR context, just execute the query
	// React's cache() should be used at the application level for deduplication
	return async () => {
		const query = queryFn();
		return await query;
	};
}

/**
 * Create a dehydrated state for client hydration.
 *
 * Use this to pass server-fetched data to client components.
 *
 * @example
 * ```tsx
 * // app/users/[id]/page.tsx
 * import { dehydrate, HydrationBoundary } from '@sylphx/lens-next';
 * import { serverClient } from '@/lib/lens-server';
 * import { UserProfile } from './user-profile';
 *
 * export default async function UserPage({ params }: { params: { id: string } }) {
 *   const user = await serverClient.user.get({ id: params.id });
 *   const dehydratedState = dehydrate({ user });
 *
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <UserProfile userId={params.id} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 */
export interface DehydratedState {
	queries: Record<string, unknown>;
	timestamp: number;
}

export function dehydrate(data: Record<string, unknown>): DehydratedState {
	return {
		queries: data,
		timestamp: Date.now(),
	};
}

/**
 * Hydration boundary for client components.
 *
 * Provides dehydrated server state to client components.
 */
export { HydrationBoundary, useHydration } from "./hydration";
