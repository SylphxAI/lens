/**
 * In-process transport - No network, direct function calls
 *
 * Use cases:
 * - TUI/CLI applications
 * - Testing
 * - Server-side rendering
 * - Same-process client-server
 */

import { Observable } from "rxjs";
import type { LensTransport } from "./interface.js";
import type { LensRequest, LensResponse } from "../schema/types.js";
import type { LensObject } from "../schema/types.js";

/**
 * In-process transport configuration
 */
export interface InProcessTransportConfig {
	api: LensObject<any>;
	context?: any;
}

/**
 * In-process transport implementation
 */
export class InProcessTransport implements LensTransport {
	constructor(private readonly config: InProcessTransportConfig) {}

	query<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request, "query");
	}

	mutate<T>(request: LensRequest): Promise<T> {
		return this.executeRequest(request, "mutation");
	}

	subscribe<T>(request: LensRequest): Observable<T> {
		// Navigate to the target
		const target = this.navigateToTarget(request);

		if (!target.subscribe) {
			throw new Error(
				`No subscription defined for: ${request.path.join(".")}`
			);
		}

		// Validate input
		const validatedInput = this.validateInput(target, request);

		return new Observable<T>((subscriber) => {
			// Builder signature depends on whether input schema exists
			const observable = target.input
				? target.subscribe(validatedInput, this.config.context)
				: target.subscribe(this.config.context);

			const subscription = observable.subscribe({
				next: (value: any) => {
					// Validate output
					const outputResult = target.output.safeParse(value);
					if (outputResult.success) {
						subscriber.next(
							this.applyFieldSelection(outputResult.data, request.select)
						);
					} else {
						subscriber.error(
							new Error(
								`Output validation failed: ${outputResult.error.message}`
							)
						);
					}
				},
				error: (error: any) => subscriber.error(error),
				complete: () => subscriber.complete(),
			});

			return () => subscription.unsubscribe();
		});
	}

	private executeRequest<T>(
		request: LensRequest,
		expectedType: "query" | "mutation"
	): Promise<T> {
		// Navigate to the target
		const target = this.navigateToTarget(request);

		// Validate input
		const validatedInput = this.validateInput(target, request);

		// Execute with context
		// Builder signature depends on whether input schema exists:
		// - With input: (input, ctx) => handler({ input, ctx })
		// - Without input: (ctx) => handler({ ctx })
		const result = target.input
			? target.resolve(validatedInput, this.config.context)
			: target.resolve(this.config.context);

		return result.then((result: any) => {
			// Validate output
			const outputResult = target.output.safeParse(result);
			if (!outputResult.success) {
				throw new Error(
					`Output validation failed: ${outputResult.error.message}`
				);
			}

			// Apply field selection
			return this.applyFieldSelection(outputResult.data, request.select) as T;
		});
	}

	private navigateToTarget(request: LensRequest): any {
		let target: any = this.config.api;

		for (const segment of request.path) {
			target = target[segment];

			if (!target) {
				throw new Error(`Path not found: ${request.path.join(".")}`);
			}
		}

		if (!target.type) {
			throw new Error(
				`Invalid target at path: ${request.path.join(".")} - expected query or mutation`
			);
		}

		return target;
	}

	private validateInput(target: any, request: LensRequest): any {
		// If no input schema defined (void input), accept undefined
		if (!target.input) {
			return undefined;
		}

		// If input is undefined, pass empty object to allow Zod defaults to apply
		const input = request.input === undefined ? {} : request.input;

		const inputResult = target.input.safeParse(input);
		if (!inputResult.success) {
			throw new Error(
				`Input validation failed: ${inputResult.error.message}`
			);
		}
		return inputResult.data;
	}

	/**
	 * Apply field selection to result
	 */
	private applyFieldSelection(data: any, select: any): any {
		if (!select) {
			return data;
		}

		if (Array.isArray(select)) {
			// Array syntax: ['id', 'name']
			const result: any = {};
			for (const key of select) {
				if (key in data) {
					result[key] = data[key];
				}
			}
			return result;
		}

		if (typeof select === "object") {
			// Object syntax: { id: true, posts: { title: true } }
			const result: any = {};

			for (const [key, value] of Object.entries(select)) {
				if (!(key in data)) continue;

				if (value === true) {
					result[key] = data[key];
				} else if (typeof value === "object") {
					// Nested selection
					const nested = data[key];
					if (Array.isArray(nested)) {
						result[key] = nested.map((item) =>
							this.applyFieldSelection(item, value)
						);
					} else if (nested !== null && nested !== undefined) {
						result[key] = this.applyFieldSelection(nested, value);
					}
				}
			}

			return result;
		}

		// No selection or unsupported format
		return data;
	}
}
