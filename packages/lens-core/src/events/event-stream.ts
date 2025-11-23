/**
 * Event Stream
 *
 * Simple in-memory event bus for resource subscriptions.
 * Production implementation would use Redis, Kafka, or other message broker.
 *
 * @module @sylphx/lens-core/events
 */

import { Subject, Observable } from "rxjs";
import { filter, share } from "rxjs/operators";

/**
 * Event with key and data
 */
export interface Event<T = any> {
	key: string;
	data: T;
	timestamp: number;
}

/**
 * Subscription options
 */
export interface SubscriptionOptions<T = any> {
	next?: (data: T) => void;
	error?: (error: Error) => void;
	complete?: () => void;
}

/**
 * In-memory event stream
 *
 * Simple pub/sub system for resource events.
 * Use for development and testing.
 */
export class EventStream {
	private subject = new Subject<Event>();
	private stream$ = this.subject.asObservable().pipe(share());

	/**
	 * Publish event
	 *
	 * @param key - Event key (e.g., "user:123", "user:list")
	 * @param data - Event data
	 */
	publish<T = any>(key: string, data: T): void {
		this.subject.next({
			key,
			data,
			timestamp: Date.now(),
		});
	}

	/**
	 * Subscribe to events matching key
	 *
	 * @param key - Event key to match (exact match)
	 * @param options - Subscription handlers
	 * @returns Subscription with unsubscribe method
	 */
	subscribe<T = any>(
		key: string,
		options: SubscriptionOptions<T>,
	): { unsubscribe: () => void } {
		const subscription = this.stream$
			.pipe(filter((event) => event.key === key))
			.subscribe({
				next: (event) => {
					if (options.next) {
						try {
							options.next(event.data);
						} catch (error) {
							// Isolate subscriber errors - don't propagate to stream
							// Call error handler if provided
							if (options.error && error instanceof Error) {
								try {
									options.error(error);
								} catch {
									// Error handler itself threw - ignore to prevent infinite loops
								}
							}
						}
					}
				},
				error: (error) => {
					if (options.error) {
						options.error(error);
					}
				},
				complete: () => {
					if (options.complete) {
						options.complete();
					}
				},
			});

		return {
			unsubscribe: () => subscription.unsubscribe(),
		};
	}

	/**
	 * Subscribe to events matching pattern
	 *
	 * @param pattern - RegExp pattern to match event keys
	 * @param options - Subscription handlers
	 * @returns Subscription with unsubscribe method
	 */
	subscribePattern<T = any>(
		pattern: RegExp,
		options: SubscriptionOptions<T>,
	): { unsubscribe: () => void } {
		const subscription = this.stream$
			.pipe(filter((event) => pattern.test(event.key)))
			.subscribe({
				next: (event) => {
					if (options.next) {
						try {
							options.next(event.data);
						} catch (error) {
							// Isolate subscriber errors - don't propagate to stream
							// Call error handler if provided
							if (options.error && error instanceof Error) {
								try {
									options.error(error);
								} catch {
									// Error handler itself threw - ignore to prevent infinite loops
								}
							}
						}
					}
				},
				error: (error) => {
					if (options.error) {
						options.error(error);
					}
				},
				complete: () => {
					if (options.complete) {
						options.complete();
					}
				},
			});

		return {
			unsubscribe: () => subscription.unsubscribe(),
		};
	}

	/**
	 * Get observable for specific key
	 *
	 * @param key - Event key
	 * @returns Observable of events
	 */
	observe<T = any>(key: string): Observable<T> {
		return new Observable((observer) => {
			const subscription = this.subscribe<T>(key, {
				next: (data) => observer.next(data),
				error: (error) => observer.error(error),
				complete: () => observer.complete(),
			});

			return () => subscription.unsubscribe();
		});
	}

	/**
	 * Clear all subscriptions and events
	 */
	clear(): void {
		this.subject.complete();
		this.subject = new Subject<Event>();
		this.stream$ = this.subject.asObservable().pipe(share());
	}
}

/**
 * Create new event stream
 */
export function createEventStream(): EventStream {
	return new EventStream();
}
