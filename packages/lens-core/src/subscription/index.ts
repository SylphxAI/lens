/**
 * Subscription System
 *
 * Field-level subscriptions for granular real-time updates.
 *
 * @module @sylphx/lens-core/subscription
 */

export {
	FieldSubscriptionManager,
	getFieldSubscriptionManager,
	setFieldSubscriptionManager,
	isStreamingHandlers,
	isFieldHandlers,
	applyDelta,
	type DeltaOperation,
	type StreamingFieldHandlers,
	type FieldHandlers,
	type FieldSubscriptionHandlers,
	type FieldSubscriptions,
	type FieldSubscriptionOptions,
	type FieldUpdateEvent,
} from "./field-subscription";
