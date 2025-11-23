/**
 * Basic Example - Client
 *
 * This file creates the Lens client for React usage.
 */

import { createClient } from "@lens/client";
import type { Schema } from "./schema";

/**
 * Create a typed client from your schema
 *
 * The client provides type-safe access to all entities
 * defined in your schema.
 */
export const api = createClient<Schema>({
	url: "ws://localhost:3000",
});

// Export for use in components
export type Api = typeof api;
