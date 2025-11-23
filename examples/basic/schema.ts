/**
 * Basic Example - Schema Definition
 *
 * This file defines the data schema for the example app.
 */

import { createSchema, t } from "@lens/core";

/**
 * Define your schema with type-safe field definitions
 */
export const schema = createSchema({
	User: {
		id: t.id(),
		name: t.string(),
		email: t.string(),
		avatar: t.string().optional(),
		posts: t.hasMany("Post"),
		createdAt: t.string(),
	},
	Post: {
		id: t.id(),
		title: t.string(),
		content: t.string(),
		published: t.boolean(),
		author: t.belongsTo("User"),
		createdAt: t.string(),
	},
});

// Export the schema type for client type inference
export type Schema = typeof schema;
