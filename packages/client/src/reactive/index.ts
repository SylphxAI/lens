/**
 * @sylphx/lens-client - Reactive System
 *
 * Fine-grained reactive primitives for entity subscriptions.
 */

export {
	EntitySignal,
	createEntitySignal,
	deriveEntitySignal,
	type FieldSignals,
	type EntitySignalOptions,
	type DisposeCallback,
} from "./entity-signal";

export {
	SubscriptionManager,
	createSubscriptionManager,
	type EntityKey,
	type FieldSubscription,
	type EntitySubscription,
	type SubscribeMessage,
	type UnsubscribeMessage,
	type UpdateMessage,
	type ServerMessage,
	type SubscriptionTransport,
} from "./subscription-manager";

export {
	QueryResolver,
	createQueryResolver,
	type QueryDef,
	type QueryResult,
	type ListQueryResult,
	type QueryTransport,
} from "./query-resolver";

export {
	createReactiveClient,
	type ReactiveClient,
	type ReactiveClientConfig,
	type ReactiveEntityAccessor,
	type EntityResult,
	type ListResult,
	type MutationResult as ReactiveMutationResult,
	type QueryOptions as ReactiveQueryOptions,
	type ListOptions as ReactiveListOptions,
	type InferQueryResult as ReactiveInferQueryResult,
} from "./reactive-client";
