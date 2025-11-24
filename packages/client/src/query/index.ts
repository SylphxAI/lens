/**
 * @lens/client - Query Module
 *
 * QueryResult - unified API that is both Thenable (can await) and Subscribable (can subscribe).
 * Enables direct server communication with optional streaming.
 */

export {
	createQueryResult,
	type QueryResult,
	type Observer,
	type Subscription,
} from "./query-result";
