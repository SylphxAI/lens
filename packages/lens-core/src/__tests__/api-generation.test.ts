/**
 * Tests for API generation from resources
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";
import { defineResource, hasMany, belongsTo, getRegistry } from "../resource/index";
import type { QueryContext } from "../resource/types";

describe("API Generation", () => {
	beforeEach(() => {
		getRegistry().clear();
	});

	describe("Basic API Structure", () => {
		test("should auto-generate API on resource definition", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
			});

			expect(User.api).toBeDefined();
			expect(User.api.get).toBeDefined();
			expect(User.api.list).toBeDefined();
			expect(User.api.create).toBeDefined();
			expect(User.api.update).toBeDefined();
			expect(User.api.delete).toBeDefined();
		});

		test("should have correct method signatures", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
			});

			expect(typeof User.api.get.query).toBe("function");
			expect(typeof User.api.get.subscribe).toBe("function");
			expect(typeof User.api.list.query).toBe("function");
			expect(typeof User.api.list.subscribe).toBe("function");
			expect(typeof User.api.create.mutate).toBe("function");
			expect(typeof User.api.update.mutate).toBe("function");
			expect(typeof User.api.delete.mutate).toBe("function");
		});
	});

	describe("get Query", () => {
		test("should query entity by id", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
			});

			const mockDb = {
				batchLoadByIds: mock(async (table: string, ids: string[]) => {
					return ids.map((id) => ({
						id,
						name: `User ${id}`,
						email: `user${id}@example.com`,
					}));
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.get.query({ id: "1" }, undefined, ctx);

			expect(result).toEqual({
				id: "1",
				name: "User 1",
				email: "user1@example.com",
			});
		});

		// TODO: Add test for non-existent entity handling once database adapter is implemented
		// Currently requires full DataLoader + database integration

		test("should apply field selection", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
					bio: z.string(),
				}),
			});

			const mockDb = {
				batchLoadByIds: mock(async () => [
					{
						id: "1",
						name: "Alice",
						email: "alice@example.com",
						bio: "Developer",
					},
				]),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.get.query(
				{ id: "1" },
				{
					select: {
						id: true,
						name: true,
					},
				},
				ctx,
			);

			expect(result).toEqual({
				id: "1",
				name: "Alice",
			});
			expect(result).not.toHaveProperty("email");
			expect(result).not.toHaveProperty("bio");
		});

		test("should throw error without context", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			await expect(User.api.get.query({ id: "1" })).rejects.toThrow(
				"Context with database required",
			);
		});
	});

	describe("list Query", () => {
		test("should query all entities", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
			});

			const mockDb = {
				findMany: mock(async () => [
					{ id: "1", name: "Alice" },
					{ id: "2", name: "Bob" },
				]),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.list.query(undefined, ctx);

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("Alice");
			expect(result[1].name).toBe("Bob");
		});

		test("should apply where filter", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					role: z.string(),
				}),
			});

			const mockDb = {
				findMany: mock(async (table: string, options: any) => {
					expect(options.where).toEqual({ role: "admin" });
					return [{ id: "1", name: "Alice", role: "admin" }];
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.list.query({ where: { role: "admin" } }, ctx);

			expect(result).toHaveLength(1);
			expect(mockDb.findMany).toHaveBeenCalled();
		});

		test("should apply ordering", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					createdAt: z.date(),
				}),
			});

			const mockDb = {
				findMany: mock(async (table: string, options: any) => {
					expect(options.orderBy).toEqual({ createdAt: "desc" });
					return [];
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.list.query({ orderBy: { createdAt: "desc" } }, ctx);

			expect(mockDb.findMany).toHaveBeenCalled();
		});

		test("should apply pagination", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const mockDb = {
				findMany: mock(async (table: string, options: any) => {
					expect(options.limit).toBe(10);
					expect(options.offset).toBe(20);
					return [];
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.list.query({ limit: 10, offset: 20 }, ctx);

			expect(mockDb.findMany).toHaveBeenCalled();
		});

		test("should apply field selection to list", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
			});

			const mockDb = {
				findMany: mock(async () => [
					{ id: "1", name: "Alice", email: "alice@example.com" },
					{ id: "2", name: "Bob", email: "bob@example.com" },
				]),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.list.query(
				{
					select: {
						id: true,
						name: true,
					},
				},
				ctx,
			);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ id: "1", name: "Alice" });
			expect(result[0]).not.toHaveProperty("email");
		});
	});

	describe("create Mutation", () => {
		test("should create entity", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
			});

			const mockDb = {
				create: mock(async (table: string, data: any) => {
					return { id: "new-1", ...data };
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.create.mutate(
				{
					name: "Charlie",
					email: "charlie@example.com",
				},
				undefined,
				ctx,
			);

			expect(result.id).toBe("new-1");
			expect(result.name).toBe("Charlie");
			expect(result.email).toBe("charlie@example.com");
			expect(mockDb.create).toHaveBeenCalled();
		});

		test("should validate with Zod schema", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string().email(),
				}),
			});

			const mockDb = {
				create: mock(async () => ({ id: "1" })),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await expect(
				User.api.create.mutate(
					{
						name: "Invalid",
						email: "not-an-email",
					},
					undefined,
					ctx,
				),
			).rejects.toThrow();
		});

		test("should execute beforeCreate hook", async () => {
			const beforeCreateMock = mock(async (data: any) => ({
				...data,
				createdAt: new Date("2024-01-01"),
			}));

			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					createdAt: z.date().optional(),
				}),
				hooks: {
					beforeCreate: beforeCreateMock,
				},
			});

			const mockDb = {
				create: mock(async (table: string, data: any) => {
					expect(data.createdAt).toBeInstanceOf(Date);
					return { id: "1", ...data };
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.create.mutate({ name: "Alice" }, undefined, ctx);

			expect(beforeCreateMock).toHaveBeenCalled();
		});

		test("should execute afterCreate hook", async () => {
			const afterCreateMock = mock(async (entity: any) => {
				// Side effect hook
			});

			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
				}),
				hooks: {
					afterCreate: afterCreateMock,
				},
			});

			const mockDb = {
				create: mock(async () => ({ id: "1", name: "Alice" })),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.create.mutate({ name: "Alice" }, undefined, ctx);

			expect(afterCreateMock).toHaveBeenCalledWith({
				id: "1",
				name: "Alice",
			});
		});

		test("should skip hooks when skipHooks=true", async () => {
			const beforeCreateMock = mock(async (data: any) => data);
			const afterCreateMock = mock(async () => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
				hooks: {
					beforeCreate: beforeCreateMock,
					afterCreate: afterCreateMock,
				},
			});

			const mockDb = {
				create: mock(async () => ({ id: "1", name: "Alice" })),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.create.mutate(
				{ name: "Alice" },
				{ skipHooks: true },
				ctx,
			);

			expect(beforeCreateMock).not.toHaveBeenCalled();
			expect(afterCreateMock).not.toHaveBeenCalled();
		});

		test("should publish create event", async () => {
			const publishMock = mock((key: string, data: any) => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const mockDb = {
				create: mock(async () => ({ id: "1", name: "Alice" })),
			};

			const ctx: QueryContext = {
				db: mockDb,
				eventStream: { publish: publishMock },
			} as any;

			await User.api.create.mutate({ name: "Alice" }, undefined, ctx);

			expect(publishMock).toHaveBeenCalledWith("user:1", {
				id: "1",
				name: "Alice",
			});
			expect(publishMock).toHaveBeenCalledWith("user:list", {
				id: "1",
				name: "Alice",
			});
		});
	});

	describe("update Mutation", () => {
		test("should update entity", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					email: z.string(),
				}),
			});

			const mockDb = {
				update: mock(async (table: string, id: string, data: any) => {
					return { id, name: data.name, email: "old@example.com" };
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.update.mutate(
				{
					id: "1",
					data: { name: "Updated Name" },
				},
				undefined,
				ctx,
			);

			expect(result.id).toBe("1");
			expect(result.name).toBe("Updated Name");
			expect(mockDb.update).toHaveBeenCalledWith("users", "1", {
				name: "Updated Name",
			});
		});

		test("should execute beforeUpdate hook", async () => {
			const beforeUpdateMock = mock(async (id: string, data: any) => ({
				...data,
				updatedAt: new Date("2024-01-01"),
			}));

			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					updatedAt: z.date().optional(),
				}),
				hooks: {
					beforeUpdate: beforeUpdateMock,
				},
			});

			const mockDb = {
				update: mock(async (table: string, id: string, data: any) => {
					expect(data.updatedAt).toBeInstanceOf(Date);
					return { id, ...data };
				}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.update.mutate(
				{ id: "1", data: { name: "New Name" } },
				undefined,
				ctx,
			);

			expect(beforeUpdateMock).toHaveBeenCalled();
		});

		test("should execute afterUpdate hook", async () => {
			const afterUpdateMock = mock(async (entity: any) => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
				hooks: {
					afterUpdate: afterUpdateMock,
				},
			});

			const mockDb = {
				update: mock(async () => ({ id: "1", name: "Updated" })),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.update.mutate(
				{ id: "1", data: { name: "Updated" } },
				undefined,
				ctx,
			);

			expect(afterUpdateMock).toHaveBeenCalledWith({
				id: "1",
				name: "Updated",
			});
		});

		test("should publish update event", async () => {
			const publishMock = mock(() => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const mockDb = {
				update: mock(async () => ({ id: "1", name: "Updated" })),
			};

			const ctx: QueryContext = {
				db: mockDb,
				eventStream: { publish: publishMock },
			} as any;

			await User.api.update.mutate(
				{ id: "1", data: { name: "Updated" } },
				undefined,
				ctx,
			);

			expect(publishMock).toHaveBeenCalledWith("user:1", {
				id: "1",
				name: "Updated",
			});
		});
	});

	describe("delete Mutation", () => {
		test("should delete entity", async () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const mockDb = {
				delete: mock(async (table: string, id: string) => {}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			const result = await User.api.delete.mutate({ id: "1" }, ctx);

			expect(result).toEqual({ id: "1", deleted: true });
			expect(mockDb.delete).toHaveBeenCalledWith("users", "1");
		});

		test("should execute beforeDelete hook", async () => {
			const beforeDeleteMock = mock(async (id: string) => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
				hooks: {
					beforeDelete: beforeDeleteMock,
				},
			});

			const mockDb = {
				delete: mock(async () => {}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.delete.mutate({ id: "1" }, ctx);

			expect(beforeDeleteMock).toHaveBeenCalledWith("1");
		});

		test("should execute afterDelete hook", async () => {
			const afterDeleteMock = mock(async (id: string) => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
				hooks: {
					afterDelete: afterDeleteMock,
				},
			});

			const mockDb = {
				delete: mock(async () => {}),
			};

			const ctx: QueryContext = { db: mockDb } as any;

			await User.api.delete.mutate({ id: "1" }, ctx);

			expect(afterDeleteMock).toHaveBeenCalledWith("1");
		});

		test("should publish delete event", async () => {
			const publishMock = mock(() => {});

			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			const mockDb = {
				delete: mock(async () => {}),
			};

			const ctx: QueryContext = {
				db: mockDb,
				eventStream: { publish: publishMock },
			} as any;

			await User.api.delete.mutate({ id: "1" }, ctx);

			expect(publishMock).toHaveBeenCalledWith("user:1", null);
		});
	});

	describe("Subscriptions", () => {
		test("should subscribe to entity updates", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string(), name: z.string() }),
			});

			const subscribeMock = mock(() => ({
				unsubscribe: mock(() => {}),
			}));

			const ctx: QueryContext = {
				eventStream: { subscribe: subscribeMock },
			} as any;

			const subscription = User.api.get.subscribe(
				{ id: "1" },
				undefined,
				{
					onData: (data) => {},
				},
				ctx,
			);

			expect(subscribeMock).toHaveBeenCalledWith(
				"user:1",
				expect.any(Object),
			);
			expect(subscription.unsubscribe).toBeDefined();
		});

		test("should subscribe to list updates", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({ id: z.string() }),
			});

			const subscribeMock = mock(() => ({
				unsubscribe: mock(() => {}),
			}));

			const ctx: QueryContext = {
				eventStream: { subscribe: subscribeMock },
			} as any;

			User.api.list.subscribe(
				undefined,
				{
					onData: (data) => {},
				},
				ctx,
			);

			expect(subscribeMock).toHaveBeenCalledWith(
				"user:list",
				expect.any(Object),
			);
		});
	});

	describe("Type Inference", () => {
		test("should infer entity type from resource", () => {
			const User = defineResource({
				name: "user",
				fields: z.object({
					id: z.string(),
					name: z.string(),
					age: z.number(),
				}),
			});

			// Type test - this should compile
			type UserEntity = (typeof User)["entity"];

			const _typeCheck: UserEntity = {
				id: "1",
				name: "Alice",
				age: 30,
			};
		});
	});
});
