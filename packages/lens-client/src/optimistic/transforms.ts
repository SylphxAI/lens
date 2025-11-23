/**
 * Transform Executors - Execute declarative transforms
 *
 * All transforms are language-agnostic and can be implemented in any language.
 * This is the TypeScript implementation.
 */

import type { TransformDescriptor } from "@sylphx/lens-core";

/**
 * Execute a transform descriptor
 *
 * @param descriptor - Transform descriptor to execute
 * @param context - Execution context (for resolving field references)
 * @returns Computed value
 */
export function executeTransform(descriptor: TransformDescriptor, context: any): any {
	const { name } = descriptor;

	switch (name) {
		// ===== Conditional Logic =====
		case "if":
			return executeIf(descriptor, context);
		case "switch":
			return executeSwitch(descriptor, context);
		case "coalesce":
			return executeCoalesce(descriptor, context);
		case "default":
			return executeDefault(descriptor, context);

		// ===== Math Operations =====
		case "add":
			return executeAdd(descriptor, context);
		case "subtract":
			return executeSubtract(descriptor, context);
		case "multiply":
			return executeMultiply(descriptor, context);
		case "divide":
			return executeDivide(descriptor, context);
		case "mod":
			return executeMod(descriptor, context);
		case "max":
			return executeMax(descriptor, context);
		case "min":
			return executeMin(descriptor, context);
		case "abs":
			return executeAbs(descriptor, context);
		case "round":
			return executeRound(descriptor, context);
		case "floor":
			return executeFloor(descriptor, context);
		case "ceil":
			return executeCeil(descriptor, context);

		// ===== String Operations =====
		case "concat":
			return executeConcat(descriptor, context);
		case "join":
			return executeJoin(descriptor, context);
		case "uppercase":
			return executeUppercase(descriptor, context);
		case "lowercase":
			return executeLowercase(descriptor, context);
		case "trim":
			return executeTrim(descriptor, context);
		case "substring":
			return executeSubstring(descriptor, context);
		case "replace":
			return executeReplace(descriptor, context);
		case "template":
			return executeTemplate(descriptor, context);
		case "length":
			return executeLength(descriptor, context);

		// ===== Array Operations =====
		case "spread":
			return executeSpread(descriptor, context);
		case "map":
			return executeMap(descriptor, context);
		case "filter":
			return executeFilter(descriptor, context);
		case "flatten":
			return executeFlatten(descriptor, context);
		case "slice":
			return executeSlice(descriptor, context);
		case "first":
			return executeFirst(descriptor, context);
		case "last":
			return executeLast(descriptor, context);

		// ===== Object Operations =====
		case "merge":
			return executeMerge(descriptor, context);
		case "deepMerge":
			return executeDeepMerge(descriptor, context);
		case "pick":
			return executePick(descriptor, context);
		case "omit":
			return executeOmit(descriptor, context);
		case "keys":
			return executeKeys(descriptor, context);
		case "values":
			return executeValues(descriptor, context);

		// ===== Time Operations =====
		case "now":
			return Date.now();
		case "timestamp":
			return new Date().toISOString();
		case "unixTimestamp":
			return Math.floor(Date.now() / 1000);

		// ===== Crypto Operations =====
		case "uuid":
			return executeUuid();
		case "hash":
			return executeHash(descriptor, context);
		case "md5":
			return executeMd5(descriptor, context);

		// ===== JSON Operations =====
		case "json":
			return executeJson(descriptor, context);
		case "parse":
			return executeParse(descriptor, context);

		default:
			throw new Error(`Unknown transform: ${name}`);
	}
}

// ===== Helper: Resolve descriptor to value =====

/**
 * Resolve a descriptor to its actual value
 */
function resolveDescriptor(descriptor: any, context: any): any {
	if (!descriptor || typeof descriptor !== "object") {
		return descriptor;
	}

	switch (descriptor.type) {
		case "literal":
			return descriptor.value;
		case "field":
			return resolveFieldPath(descriptor.path, context);
		case "transform":
			return executeTransform(descriptor, context);
		default:
			return descriptor;
	}
}

/**
 * Resolve a field path from context
 */
function resolveFieldPath(path: string[], context: any): any {
	let value = context;
	for (const key of path) {
		if (value == null) return undefined;
		value = value[key];
	}
	return value;
}

// ===== Conditional Logic =====

function executeIf(descriptor: any, context: any): any {
	const condition = resolveDescriptor(descriptor.condition, context);
	return condition
		? resolveDescriptor(descriptor.ifTrue, context)
		: resolveDescriptor(descriptor.ifFalse, context);
}

function executeSwitch(descriptor: any, context: any): any {
	const value = resolveDescriptor(descriptor.value, context);
	const caseValue = descriptor.cases[String(value)];
	if (caseValue !== undefined) {
		return resolveDescriptor(caseValue, context);
	}
	return resolveDescriptor(descriptor.default, context);
}

function executeCoalesce(descriptor: any, context: any): any {
	for (const val of descriptor.values) {
		const resolved = resolveDescriptor(val, context);
		if (resolved != null) {
			return resolved;
		}
	}
	return undefined;
}

function executeDefault(descriptor: any, context: any): any {
	const value = resolveDescriptor(descriptor.value, context);
	return value != null ? value : resolveDescriptor(descriptor.defaultValue, context);
}

// ===== Math Operations =====

function executeAdd(descriptor: any, context: any): number {
	return descriptor.values.reduce((sum: number, val: any) => {
		return sum + Number(resolveDescriptor(val, context));
	}, 0);
}

function executeSubtract(descriptor: any, context: any): number {
	const a = Number(resolveDescriptor(descriptor.a, context));
	const b = Number(resolveDescriptor(descriptor.b, context));
	return a - b;
}

function executeMultiply(descriptor: any, context: any): number {
	return descriptor.values.reduce((product: number, val: any) => {
		return product * Number(resolveDescriptor(val, context));
	}, 1);
}

function executeDivide(descriptor: any, context: any): number {
	const a = Number(resolveDescriptor(descriptor.a, context));
	const b = Number(resolveDescriptor(descriptor.b, context));
	return a / b;
}

function executeMod(descriptor: any, context: any): number {
	const a = Number(resolveDescriptor(descriptor.a, context));
	const b = Number(resolveDescriptor(descriptor.b, context));
	return a % b;
}

function executeMax(descriptor: any, context: any): number {
	const values = descriptor.values.map((val: any) => Number(resolveDescriptor(val, context)));
	return Math.max(...values);
}

function executeMin(descriptor: any, context: any): number {
	const values = descriptor.values.map((val: any) => Number(resolveDescriptor(val, context)));
	return Math.min(...values);
}

function executeAbs(descriptor: any, context: any): number {
	const value = Number(resolveDescriptor(descriptor.value, context));
	return Math.abs(value);
}

function executeRound(descriptor: any, context: any): number {
	const value = Number(resolveDescriptor(descriptor.value, context));
	return Math.round(value);
}

function executeFloor(descriptor: any, context: any): number {
	const value = Number(resolveDescriptor(descriptor.value, context));
	return Math.floor(value);
}

function executeCeil(descriptor: any, context: any): number {
	const value = Number(resolveDescriptor(descriptor.value, context));
	return Math.ceil(value);
}

// ===== String Operations =====

function executeConcat(descriptor: any, context: any): string {
	return descriptor.values
		.map((val: any) => String(resolveDescriptor(val, context)))
		.join("");
}

function executeJoin(descriptor: any, context: any): string {
	const array = resolveDescriptor(descriptor.array, context);
	const separator = descriptor.separator;
	return Array.isArray(array) ? array.join(separator) : "";
}

function executeUppercase(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	return value.toUpperCase();
}

function executeLowercase(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	return value.toLowerCase();
}

function executeTrim(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	return value.trim();
}

function executeSubstring(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	const start = descriptor.start;
	const end = descriptor.end;
	return end !== undefined ? value.substring(start, end) : value.substring(start);
}

function executeReplace(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	const search = descriptor.search;
	const replacement = descriptor.replacement;
	return value.replace(search, replacement);
}

function executeTemplate(descriptor: any, context: any): string {
	let template = descriptor.template;
	for (const [key, valDesc] of Object.entries(descriptor.vars)) {
		const value = String(resolveDescriptor(valDesc, context));
		template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
	}
	return template;
}

function executeLength(descriptor: any, context: any): number {
	const value = resolveDescriptor(descriptor.value, context);
	if (typeof value === "string" || Array.isArray(value)) {
		return value.length;
	}
	return 0;
}

// ===== Array Operations =====

function executeSpread(descriptor: any, context: any): any[] {
	const array = resolveDescriptor(descriptor.array, context);
	return Array.isArray(array) ? [...array] : [];
}

function executeMap(descriptor: any, context: any): any[] {
	const array = resolveDescriptor(descriptor.array, context);
	const transformName = descriptor.transform;
	if (!Array.isArray(array)) return [];

	// For now, we support predefined transforms by name
	// In the future, we could support custom transform definitions
	return array.map((item) => {
		if (transformName === "uppercase") return String(item).toUpperCase();
		if (transformName === "lowercase") return String(item).toLowerCase();
		return item;
	});
}

function executeFilter(descriptor: any, context: any): any[] {
	const array = resolveDescriptor(descriptor.array, context);
	const predicateName = descriptor.predicate;
	if (!Array.isArray(array)) return [];

	// For now, we support predefined predicates by name
	return array.filter((item) => {
		if (predicateName === "isActive") return item?.active === true;
		if (predicateName === "isNotNull") return item != null;
		return true;
	});
}

function executeFlatten(descriptor: any, context: any): any[] {
	const array = resolveDescriptor(descriptor.array, context);
	if (!Array.isArray(array)) return [];
	return array.flat();
}

function executeSlice(descriptor: any, context: any): any[] {
	const array = resolveDescriptor(descriptor.array, context);
	const start = descriptor.start;
	const end = descriptor.end;
	if (!Array.isArray(array)) return [];
	return end !== undefined ? array.slice(start, end) : array.slice(start);
}

function executeFirst(descriptor: any, context: any): any {
	const array = resolveDescriptor(descriptor.array, context);
	return Array.isArray(array) ? array[0] : undefined;
}

function executeLast(descriptor: any, context: any): any {
	const array = resolveDescriptor(descriptor.array, context);
	return Array.isArray(array) ? array[array.length - 1] : undefined;
}

// ===== Object Operations =====

function executeMerge(descriptor: any, context: any): Record<string, any> {
	const objects = descriptor.objects.map((obj: any) => resolveDescriptor(obj, context));
	return Object.assign({}, ...objects);
}

function executeDeepMerge(descriptor: any, context: any): Record<string, any> {
	const objects = descriptor.objects.map((obj: any) => resolveDescriptor(obj, context));

	function deepMergeTwo(target: any, source: any): any {
		const result = { ...target };
		for (const key in source) {
			if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
				result[key] = deepMergeTwo(result[key] || {}, source[key]);
			} else {
				result[key] = source[key];
			}
		}
		return result;
	}

	return objects.reduce((merged: any, obj: any) => deepMergeTwo(merged, obj), {});
}

function executePick(descriptor: any, context: any): Record<string, any> {
	const object = resolveDescriptor(descriptor.object, context);
	const keys = descriptor.keys;
	const result: Record<string, any> = {};
	for (const key of keys) {
		if (key in object) {
			result[key] = object[key];
		}
	}
	return result;
}

function executeOmit(descriptor: any, context: any): Record<string, any> {
	const object = resolveDescriptor(descriptor.object, context);
	const keys = descriptor.keys;
	const result = { ...object };
	for (const key of keys) {
		delete result[key];
	}
	return result;
}

function executeKeys(descriptor: any, context: any): string[] {
	const object = resolveDescriptor(descriptor.object, context);
	return Object.keys(object || {});
}

function executeValues(descriptor: any, context: any): any[] {
	const object = resolveDescriptor(descriptor.object, context);
	return Object.values(object || {});
}

// ===== Crypto Operations =====

function executeUuid(): string {
	// Simple UUID v4 implementation
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

function executeHash(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	// Browser-compatible hash using SubtleCrypto would be async
	// For now, we return a simple hash placeholder
	// In production, this should use crypto.subtle.digest('SHA-256', ...)
	return `hash-${value}`;
}

function executeMd5(descriptor: any, context: any): string {
	const value = String(resolveDescriptor(descriptor.value, context));
	// MD5 would require a library or crypto API
	// For now, we return a placeholder
	return `md5-${value}`;
}

// ===== JSON Operations =====

function executeJson(descriptor: any, context: any): string {
	const value = resolveDescriptor(descriptor.value, context);
	return JSON.stringify(value);
}

function executeParse(descriptor: any, context: any): any {
	const jsonString = String(resolveDescriptor(descriptor.value, context));
	try {
		return JSON.parse(jsonString);
	} catch {
		return null;
	}
}
