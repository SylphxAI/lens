/**
 * @sylphx/lens-server - Create / Command Path
 *
 * Field-emit transform seam: rewrites an emit command's field path so nested
 * field-level live queries report updates at their fully-qualified path.
 * Internal module - not part of the public API.
 */

import type { EmitCommand } from "@sylphx/lens-core";

/**
 * Prefix a command's field path for nested field emits.
 */
export function prefixCommandPath(command: EmitCommand, prefix: string): EmitCommand {
	switch (command.type) {
		case "full":
			// Full replacement at field path
			return {
				type: "field",
				field: prefix,
				update: { strategy: "value", data: command.data },
			};
		case "field":
			// Nested field path
			return {
				type: "field",
				field: command.field ? `${prefix}.${command.field}` : prefix,
				update: command.update,
			};
		case "batch":
			// Prefix all fields in batch
			return {
				type: "batch",
				updates: command.updates.map((u) => ({
					field: `${prefix}.${u.field}`,
					update: u.update,
				})),
			};
		case "array":
			// Array operations at field path - preserve as array command with field
			return {
				type: "array",
				operation: command.operation,
				field: prefix,
			};
		default:
			return command;
	}
}
