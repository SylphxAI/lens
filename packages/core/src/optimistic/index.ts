/**
 * @sylphx/lens-core - Optimistic Updates
 *
 * Internal module for optimistic update processing.
 * Users should import Reify DSL directly from @sylphx/reify.
 */

// Evaluator (for legacy MultiEntityDSL format)
export {
	applyDeferredOperation,
	applyDeferredOperations,
	type DeferredOperation,
	type EvaluatedOperation,
	type EvaluationContext,
	evaluateMultiEntityDSL,
	evaluateMultiEntityDSLMap,
	OptimisticEvaluationError,
} from "./evaluator";
export type { Pipeline } from "./reify";
// Internal - Reify type checking (used by Lens internals)
export { isPipeline } from "./reify";
