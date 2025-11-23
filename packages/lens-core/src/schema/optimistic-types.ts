/**
 * Optimistic Updates Type Definitions
 *
 * These types define the structure for optimistic updates in Lens.
 * All types are designed to be serializable for multi-language client support.
 */

/**
 * Base descriptor type
 */
export type Descriptor = FieldDescriptor | TransformDescriptor | LiteralDescriptor;

/**
 * Field descriptor - references a field in the input
 *
 * @example
 * { type: 'field', path: ['user', 'id'] }
 * // Represents: input.user.id
 */
export interface FieldDescriptor {
	type: "field";
	path: string[]; // Path to field in input (e.g., ['user', 'id'])
}

/**
 * Transform descriptor - declarative transformation
 *
 * @example
 * { type: 'transform', name: 'now' }
 * { type: 'transform', name: 'add', values: [{ type: 'field', path: ['a'] }, { type: 'literal', value: 10 }] }
 */
export interface TransformDescriptor {
	type: "transform";
	name: string; // Transform name (e.g., 'if', 'add', 'concat')
	[key: string]: any; // Transform-specific parameters
}

/**
 * Literal descriptor - static value
 *
 * @example
 * { type: 'literal', value: 'active' }
 * { type: 'literal', value: 42 }
 */
export interface LiteralDescriptor {
	type: "literal";
	value: any; // Static value
}

/**
 * Operation types
 */
export type Operation = SetOperation | ArrayPushOperation | ArraySpliceOperation;

/**
 * Set operation - sets a field value
 *
 * @example
 * {
 *   op: 'set',
 *   path: ['title'],
 *   value: { type: 'field', path: ['newTitle'] }
 * }
 */
export interface SetOperation {
	op: "set";
	path: string[]; // Path in draft (e.g., ['user', 'name'])
	value: Descriptor; // Value descriptor
}

/**
 * Array push operation - pushes items to an array
 *
 * @example
 * {
 *   op: 'array-push',
 *   path: ['tags'],
 *   items: [{ type: 'field', path: ['newTag'] }]
 * }
 */
export interface ArrayPushOperation {
	op: "array-push";
	path: string[]; // Path to array
	items: Descriptor[]; // Items to push
}

/**
 * Array splice operation - modifies an array
 *
 * @example
 * {
 *   op: 'array-splice',
 *   path: ['items'],
 *   start: 0,
 *   deleteCount: 1,
 *   items: []
 * }
 */
export interface ArraySpliceOperation {
	op: "array-splice";
	path: string[]; // Path to array
	start: number;
	deleteCount: number;
	items: Descriptor[]; // Items to insert
}

/**
 * Complete optimistic configuration
 *
 * @example
 * {
 *   entity: 'Session',
 *   id: { type: 'field', path: ['sessionId'] },
 *   operations: [
 *     { op: 'set', path: ['title'], value: { type: 'field', path: ['newTitle'] } }
 *   ]
 * }
 */
export interface OptimisticConfig {
	entity: string; // Entity type (e.g., 'Session', 'Message')
	id: FieldDescriptor; // How to extract entity ID from input
	operations: Operation[]; // List of operations to apply
}

/**
 * Optimistic update result (for client execution)
 */
export interface OptimisticUpdate {
	entity: string; // Entity type
	id: string | number; // Entity ID
	data: Record<string, any>; // Optimistic data to merge
}
