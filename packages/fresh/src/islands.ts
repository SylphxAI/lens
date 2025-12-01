/**
 * @sylphx/lens-fresh/islands
 *
 * Island-specific utilities for Fresh.
 * Use these in island components for reactive data handling.
 *
 * @example
 * ```tsx
 * // islands/UserProfile.tsx
 * import { useIslandData, useIslandQuery } from '@sylphx/lens-fresh/islands';
 * import { useLensClient } from '@sylphx/lens-fresh';
 *
 * interface Props {
 *   initialUser: SerializedData<User>;
 *   userId: string;
 * }
 *
 * export default function UserProfile({ initialUser, userId }: Props) {
 *   const client = useLensClient();
 *
 *   // Use server data as initial value, then subscribe for updates
 *   const { data: user } = useIslandQuery(
 *     () => client.user.get({ id: userId }),
 *     { initialData: initialUser }
 *   );
 *
 *   return <h1>{user?.name}</h1>;
 * }
 * ```
 */

import type { QueryResult } from "@sylphx/lens-client";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { isSerializedData, type SerializedData } from "./index.js";

// =============================================================================
// Island Data Hook
// =============================================================================

/**
 * Use serialized data from server in an island.
 *
 * Extracts the data from SerializedData wrapper.
 *
 * @example
 * ```tsx
 * export default function UserCard({ user }: { user: SerializedData<User> }) {
 *   const userData = useIslandData(user);
 *   return <div>{userData.name}</div>;
 * }
 * ```
 */
export function useIslandData<T>(serialized: SerializedData<T> | T): T {
	if (isSerializedData<T>(serialized)) {
		return serialized.data;
	}
	return serialized;
}

// =============================================================================
// Island Query Hook
// =============================================================================

export interface UseIslandQueryOptions<T> {
	/** Initial data from server */
	initialData?: SerializedData<T> | T;
	/** Skip the query */
	skip?: boolean;
}

export interface UseIslandQueryResult<T> {
	data: T | null;
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Query hook optimized for Fresh islands.
 *
 * Accepts initial server data and subscribes for updates.
 *
 * @example
 * ```tsx
 * // islands/UserProfile.tsx
 * export default function UserProfile({ initialUser, userId }: Props) {
 *   const client = useLensClient();
 *
 *   const { data, loading } = useIslandQuery(
 *     () => client.user.get({ id: userId }),
 *     { initialData: initialUser }
 *   );
 *
 *   if (loading && !data) return <Spinner />;
 *   return <h1>{data?.name}</h1>;
 * }
 * ```
 */
export function useIslandQuery<T>(
	queryFn: () => QueryResult<T>,
	options?: UseIslandQueryOptions<T>,
): UseIslandQueryResult<T> {
	// Extract initial data
	const initialData = options?.initialData
		? isSerializedData<T>(options.initialData)
			? options.initialData.data
			: options.initialData
		: null;

	const [data, setData] = useState<T | null>(initialData);
	const [loading, setLoading] = useState(!initialData && !options?.skip);
	const [error, setError] = useState<Error | null>(null);

	const mountedRef = useRef(true);
	const queryFnRef = useRef(queryFn);
	queryFnRef.current = queryFn;

	useEffect(() => {
		mountedRef.current = true;

		if (options?.skip) {
			return;
		}

		const query = queryFnRef.current();

		// Subscribe to updates
		const unsubscribe = query.subscribe((value) => {
			if (mountedRef.current) {
				setData(value);
				setLoading(false);
			}
		});

		// Initial fetch
		if (!initialData) {
			setLoading(true);
		}

		query.then(
			(value) => {
				if (mountedRef.current) {
					setData(value);
					setLoading(false);
				}
			},
			(err) => {
				if (mountedRef.current) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
			},
		);

		return () => {
			mountedRef.current = false;
			unsubscribe();
		};
	}, [options?.skip, initialData]);

	const refetch = useCallback(() => {
		if (options?.skip) return;

		setLoading(true);
		setError(null);

		const query = queryFnRef.current();
		query.then(
			(value) => {
				if (mountedRef.current) {
					setData(value);
					setLoading(false);
				}
			},
			(err) => {
				if (mountedRef.current) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
			},
		);
	}, [options?.skip]);

	return { data, loading, error, refetch };
}

// =============================================================================
// Re-export Preact Signals (optional)
// =============================================================================

export {
	createLazyQuerySignal,
	createMutationSignal,
	createQuerySignal,
	type LazyQuerySignal,
	type MutationFn,
	type MutationSignal,
	type QuerySignal,
	type QuerySignalOptions,
} from "@sylphx/lens-preact/signals";
