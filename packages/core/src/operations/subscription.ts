/**
 * @sylphx/lens-core - Subscription Builder
 *
 * Fluent interface for defining subscriptions.
 *
 * Subscription is for event streams - no initial data, only pushes events.
 */

import type { Publisher } from "../resolvers/resolver-types.js";
import type { InferReturnType, ReturnSpec, ZodLikeSchema } from "./types.js";

// =============================================================================
// Subscription Definition
// =============================================================================

/** Subscription definition - event stream only (no initial data) */
export interface SubscriptionDef<TInput = void, TOutput = unknown, TContext = unknown> {
	_type: "subscription";
	/** Subscription name (optional - derived from export key if not provided) */
	_name?: string | undefined;
	_input?: ZodLikeSchema<TInput> | undefined;
	_output?: ReturnSpec | undefined;
	/** Branded phantom types for inference */
	_brand: { input: TInput; output: TOutput };
	/** Method syntax for bivariance - allows flexible context types */
	_subscriber?(ctx: { input: TInput; ctx: TContext }): Publisher<TOutput>;
}

// =============================================================================
// Subscription Builder Interface
// =============================================================================

/** Subscription builder - fluent interface */
export interface SubscriptionBuilder<TInput = void, TOutput = unknown, TContext = unknown> {
	/** Define input validation schema (optional for subscriptions) */
	input<T>(schema: ZodLikeSchema<T>): SubscriptionBuilder<T, TOutput, TContext>;

	/** Define return type (optional - for entity outputs) */
	returns<R extends ReturnSpec>(spec: R): SubscriptionBuilder<TInput, InferReturnType<R>, TContext>;

	/**
	 * Define subscription publisher (returns Publisher).
	 * The Publisher receives { emit, onCleanup } callbacks.
	 * Returns only event stream - no initial data fetch.
	 *
	 * @example
	 * ```typescript
	 * // Event-only subscription
	 * subscription()
	 *   .input(z.object({ authorId: z.string().optional() }))
	 *   .returns(Post)
	 *   .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
	 *     const unsub = ctx.events.on("post:created", (post) => {
	 *       if (!input.authorId || post.authorId === input.authorId) {
	 *         emit(post);
	 *       }
	 *     });
	 *     onCleanup(unsub);
	 *   });
	 * ```
	 */
	subscribe<T>(
		fn: (ctx: { input: TInput; ctx: TContext }) => Publisher<T>,
	): SubscriptionDef<TInput, T, TContext>;
}

// =============================================================================
// Subscription Builder Implementation
// =============================================================================

export class SubscriptionBuilderImpl<TInput = void, TOutput = unknown, TContext = unknown>
	implements SubscriptionBuilder<TInput, TOutput, TContext>
{
	private _name?: string | undefined;
	private _inputSchema?: ZodLikeSchema<TInput> | undefined;
	private _outputSpec?: ReturnSpec | undefined;

	constructor(name?: string) {
		this._name = name;
	}

	input<T>(schema: ZodLikeSchema<T>): SubscriptionBuilder<T, TOutput, TContext> {
		const builder = new SubscriptionBuilderImpl<T, TOutput, TContext>(this._name);
		builder._inputSchema = schema;
		builder._outputSpec = this._outputSpec;
		return builder;
	}

	returns<R extends ReturnSpec>(
		spec: R,
	): SubscriptionBuilder<TInput, InferReturnType<R>, TContext> {
		const builder = new SubscriptionBuilderImpl<TInput, InferReturnType<R>, TContext>(this._name);
		builder._inputSchema = this._inputSchema as ZodLikeSchema<TInput> | undefined;
		builder._outputSpec = spec;
		return builder;
	}

	subscribe<T>(
		fn: (ctx: { input: TInput; ctx: TContext }) => Publisher<T>,
	): SubscriptionDef<TInput, T, TContext> {
		return {
			_type: "subscription",
			_name: this._name,
			_input: this._inputSchema,
			_output: this._outputSpec,
			_brand: {} as { input: TInput; output: T },
			_subscriber: fn,
		};
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a subscription builder
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const onPostCreated = subscription()
 *   .input(z.object({ authorId: z.string().optional() }))
 *   .returns(Post)
 *   .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
 *     const unsub = ctx.events.on("post:created", (post) => {
 *       if (!input.authorId || post.authorId === input.authorId) {
 *         emit(post);
 *       }
 *     });
 *     onCleanup(unsub);
 *   });
 *
 * // With typed context
 * export const onUserStatusChange = subscription<MyContext>()
 *   .input(z.object({ userId: z.string() }))
 *   .returns(UserStatus)
 *   .subscribe(({ input, ctx }) => ({ emit, onCleanup }) => {
 *     const unsub = ctx.statusService.watch(input.userId, emit);
 *     onCleanup(unsub);
 *   });
 * ```
 */
export function subscription<TContext = unknown>(): SubscriptionBuilder<void, unknown, TContext>;
export function subscription<TContext = unknown>(
	name: string,
): SubscriptionBuilder<void, unknown, TContext>;
export function subscription<TContext = unknown>(
	name?: string,
): SubscriptionBuilder<void, unknown, TContext> {
	return new SubscriptionBuilderImpl<void, unknown, TContext>(name);
}

// =============================================================================
// Type Guard
// =============================================================================

/** Check if value is a subscription definition */
export function isSubscriptionDef(value: unknown): value is SubscriptionDef {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as SubscriptionDef)._type === "subscription"
	);
}
