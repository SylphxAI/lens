/**
 * V2 Complete Example - Schema
 *
 * Demonstrates: Entity definitions with relations
 *
 * Entity names are derived from export keys:
 * - const User = entity({...}) + export { User } → name = "User"
 */

import { belongsTo, entity, hasMany, relation, t } from "@lens/core";

// =============================================================================
// Entities (name derived from variable/export key)
// =============================================================================

export const User = entity({
	id: t.id(),
	name: t.string(),
	email: t.string(),
	role: t.enum(["user", "admin", "vip"]),
	avatar: t.string().optional(),
	createdAt: t.datetime().default(() => new Date()),
});

export const Post = entity({
	id: t.id(),
	title: t.string(),
	content: t.string(),
	published: t.boolean().default(() => false),
	authorId: t.string(),
	updatedAt: t.datetime().optional(),
	createdAt: t.datetime().default(() => new Date()),
});

export const Comment = entity({
	id: t.id(),
	content: t.string(),
	postId: t.string(),
	authorId: t.string(),
	createdAt: t.datetime().default(() => new Date()),
});

// =============================================================================
// Relations
// =============================================================================

export const relations = [
	relation(User, {
		posts: hasMany(Post, (e) => e.authorId),
		comments: hasMany(Comment, (e) => e.authorId),
	}),
	relation(Post, {
		author: belongsTo(User, (e) => e.authorId),
		comments: hasMany(Comment, (e) => e.postId),
	}),
	relation(Comment, {
		author: belongsTo(User, (e) => e.authorId),
		post: belongsTo(Post, (e) => e.postId),
	}),
];
