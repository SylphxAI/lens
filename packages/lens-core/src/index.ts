/**
 * @sylphx/lens-core
 *
 * Type-safe, real-time API framework
 * Combines GraphQL field selection + tRPC type inference + Zod validation
 */

// Schema builder
export { lens, createLensBuilder } from "./schema/builder.js";

// Optimistic updates
export { OptimisticBuilder } from "./schema/optimistic-builder.js";
export { TransformUtils } from "./schema/transform-utils.js";
export type {
	OptimisticConfig,
	Descriptor,
	FieldDescriptor,
	TransformDescriptor,
	LiteralDescriptor,
	Operation,
	SetOperation,
	ArrayPushOperation,
	ArraySpliceOperation,
	OptimisticUpdate,
} from "./schema/optimistic-types.js";

// Types
export type {
	LensQuery,
	LensMutation,
	LensObject,
	LensRequest,
	LensResponse,
	FieldSelection,
	Select,
	Selected,
	InferInput,
	InferOutput,
	InferContext,
	UpdateMode,
	UpdatePayload,
} from "./schema/types.js";

// Transport
export type {
	LensTransport,
	QueryTransport,
	SubscriptionTransport,
	TransportMiddleware,
} from "./transport/interface.js";

export {
	MiddlewareTransport,
	TransportRouter,
} from "./transport/interface.js";

export { InProcessTransport } from "./transport/in-process.js";

// Update strategies
export type { UpdateStrategy } from "./update-strategy/types.js";
export { ValueStrategy } from "./update-strategy/value.js";
export { DeltaStrategy } from "./update-strategy/delta.js";
export { PatchStrategy } from "./update-strategy/patch.js";
export { AutoStrategy } from "./update-strategy/auto.js";

// Re-export Observable for convenience
export type { Observable } from "rxjs";

