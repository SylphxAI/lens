/**
 * @sylphx/client - In-Process Link (Terminal)
 *
 * Terminal link for same-process execution without network.
 */

import type { Link, LinkFn, OperationResult } from "./types";

/** Resolver signatures for in-process link */
export interface InProcessResolvers {
	/** Get single entity by ID */
	get: (entity: string, id: string, select?: Record<string, unknown>) => Promise<unknown>;
	/** List entities with filters */
	list: (
		entity: string,
		input: {
			where?: Record<string, unknown>;
			orderBy?: Record<string, "asc" | "desc">;
			take?: number;
			skip?: number;
			select?: Record<string, unknown>;
		},
	) => Promise<unknown[]>;
	/** Create entity */
	create: (entity: string, data: Record<string, unknown>) => Promise<unknown>;
	/** Update entity */
	update: (entity: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
	/** Delete entity */
	delete: (entity: string, id: string) => Promise<void>;
}

export interface InProcessLinkOptions {
	/** Direct resolver functions */
	resolvers: InProcessResolvers;
}

/**
 * In-process link - direct resolver execution without network
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   links: [
 *     loggerLink(),
 *     inProcessLink({
 *       resolvers: {
 *         get: (entity, id) => db[entity].findUnique({ where: { id } }),
 *         list: (entity, input) => db[entity].findMany(input),
 *         create: (entity, data) => db[entity].create({ data }),
 *         update: (entity, id, data) => db[entity].update({ where: { id }, data }),
 *         delete: (entity, id) => db[entity].delete({ where: { id } }),
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function inProcessLink(options: InProcessLinkOptions): Link {
	const { resolvers } = options;

	return (): LinkFn => {
		return async (op, _next): Promise<OperationResult> => {
			try {
				const input = op.input as Record<string, unknown>;

				switch (op.op) {
					case "get": {
						const data = await resolvers.get(op.entity, input.id as string, input.select as Record<string, unknown>);
						return { data };
					}

					case "list": {
						const data = await resolvers.list(op.entity, {
							where: input.where as Record<string, unknown>,
							orderBy: input.orderBy as Record<string, "asc" | "desc">,
							take: input.take as number,
							skip: input.skip as number,
							select: input.select as Record<string, unknown>,
						});
						return { data };
					}

					case "create": {
						const data = await resolvers.create(op.entity, input.data as Record<string, unknown>);
						return { data };
					}

					case "update": {
						const { id, ...updateData } = input;
						const data = await resolvers.update(op.entity, id as string, updateData);
						return { data };
					}

					case "delete": {
						await resolvers.delete(op.entity, input.id as string);
						return { data: { success: true } };
					}

					default:
						return { error: new Error(`Unknown operation: ${op.op}`) };
				}
			} catch (error) {
				return { error: error as Error };
			}
		};
	};
}

/**
 * Create in-process link from Lens server ExecutionEngine
 */
export function createInProcessLink(
	engine: {
		executeGet: (entity: string, id: string, select?: unknown) => Promise<unknown>;
		executeList: (entity: string, input: unknown) => Promise<unknown[]>;
		executeCreate: (entity: string, data: unknown) => Promise<unknown>;
		executeUpdate: (entity: string, id: string, data: unknown) => Promise<unknown>;
		executeDelete: (entity: string, id: string) => Promise<void>;
	},
): Link {
	return inProcessLink({
		resolvers: {
			get: (entity, id, select) => engine.executeGet(entity, id, select),
			list: (entity, input) => engine.executeList(entity, input),
			create: (entity, data) => engine.executeCreate(entity, data),
			update: (entity, id, data) => engine.executeUpdate(entity, id, data),
			delete: (entity, id) => engine.executeDelete(entity, id),
		},
	});
}
