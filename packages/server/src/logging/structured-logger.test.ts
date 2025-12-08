/**
 * @sylphx/lens-server - Structured Logger Tests
 */

import { describe, expect, it, spyOn } from "bun:test";
import {
	createStructuredLogger,
	jsonOutput,
	type LogEntry,
	type LogOutput,
	prettyOutput,
	toBasicLogger,
} from "./structured-logger.js";

// =============================================================================
// Tests
// =============================================================================

describe("createStructuredLogger", () => {
	describe("basic logging", () => {
		it("creates a logger with all log methods", () => {
			const logger = createStructuredLogger();

			expect(typeof logger.debug).toBe("function");
			expect(typeof logger.info).toBe("function");
			expect(typeof logger.warn).toBe("function");
			expect(typeof logger.error).toBe("function");
			expect(typeof logger.fatal).toBe("function");
		});

		it("logs messages with correct structure", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				service: "test-service",
			});

			logger.info("Test message");

			expect(entries.length).toBe(1);
			expect(entries[0].level).toBe("info");
			expect(entries[0].message).toBe("Test message");
			expect(entries[0].service).toBe("test-service");
			expect(entries[0].timestamp).toBeDefined();
		});

		it("includes context in log entries", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({ output: testOutput });

			logger.info("User action", { userId: "123", action: "login" });

			expect(entries[0].userId).toBe("123");
			expect(entries[0].action).toBe("login");
		});
	});

	describe("log levels", () => {
		it("respects minimum log level", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				level: "warn",
			});

			logger.debug("Debug message");
			logger.info("Info message");
			logger.warn("Warn message");
			logger.error("Error message");

			expect(entries.length).toBe(2);
			expect(entries[0].level).toBe("warn");
			expect(entries[1].level).toBe("error");
		});

		it("logs all levels when set to debug", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				level: "debug",
			});

			logger.debug("Debug");
			logger.info("Info");
			logger.warn("Warn");
			logger.error("Error");
			logger.fatal("Fatal");

			expect(entries.length).toBe(5);
		});
	});

	describe("error handling", () => {
		it("extracts error properties from Error objects", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({ output: testOutput });
			const error = new Error("Something went wrong");
			error.name = "ValidationError";

			logger.error("Operation failed", { error });

			expect(entries[0].errorType).toBe("ValidationError");
			expect(entries[0].errorMessage).toBe("Something went wrong");
			expect(entries[0].error).toBeUndefined(); // Original error object removed
		});

		it("includes stack trace when configured", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				includeStackTrace: true,
			});

			const error = new Error("With stack");
			logger.error("Error with stack", { error });

			expect(entries[0].stack).toBeDefined();
			expect(entries[0].stack).toContain("Error: With stack");
		});

		it("excludes stack trace by default", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({ output: testOutput });

			const error = new Error("Without stack");
			logger.error("Error without stack", { error });

			expect(entries[0].stack).toBeUndefined();
		});
	});

	describe("child logger", () => {
		it("creates child logger with inherited context", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const parent = createStructuredLogger({
				output: testOutput,
				defaultContext: { app: "test-app" },
			});

			const child = parent.child({ requestId: "req-123" });

			child.info("Child message");

			expect(entries[0].app).toBe("test-app");
			expect(entries[0].requestId).toBe("req-123");
		});

		it("child context overrides parent context", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const parent = createStructuredLogger({
				output: testOutput,
				defaultContext: { version: "1.0" },
			});

			const child = parent.child({ version: "2.0" });

			child.info("Override test");

			expect(entries[0].version).toBe("2.0");
		});
	});

	describe("request logging", () => {
		it("logs with request ID", () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({ output: testOutput });

			logger.request("req-456", "Request started", { path: "/api/users" });

			expect(entries[0].requestId).toBe("req-456");
			expect(entries[0].path).toBe("/api/users");
		});
	});

	describe("operation tracking", () => {
		it("tracks operation duration on success", async () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				level: "debug",
			});

			const done = logger.startOperation("getUser", { requestId: "req-789" });

			// Simulate some work
			await new Promise((r) => setTimeout(r, 10));

			done();

			// Should have start and completion logs
			expect(entries.length).toBe(2);
			expect(entries[0].message).toContain("started");
			expect(entries[1].message).toContain("completed");
			expect(entries[1].durationMs).toBeGreaterThanOrEqual(10);
			expect(entries[1].operation).toBe("getUser");
		});

		it("tracks operation duration on error", async () => {
			const entries: LogEntry[] = [];
			const testOutput: LogOutput = {
				write(entry) {
					entries.push(entry);
				},
			};

			const logger = createStructuredLogger({
				output: testOutput,
				level: "debug",
			});

			const done = logger.startOperation("createUser");

			done({ error: new Error("Validation failed") });

			expect(entries.length).toBe(2);
			expect(entries[1].message).toContain("failed");
			expect(entries[1].errorMessage).toBe("Validation failed");
		});
	});
});

describe("outputs", () => {
	describe("jsonOutput", () => {
		it("outputs JSON to console", () => {
			const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

			jsonOutput.write({
				timestamp: "2024-01-01T00:00:00.000Z",
				level: "info",
				message: "Test",
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				'{"timestamp":"2024-01-01T00:00:00.000Z","level":"info","message":"Test"}',
			);

			consoleSpy.mockRestore();
		});
	});

	describe("prettyOutput", () => {
		it("outputs formatted message to console", () => {
			const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

			prettyOutput.write({
				timestamp: "2024-01-01T00:00:00.000Z",
				level: "info",
				message: "Test message",
			});

			expect(consoleSpy).toHaveBeenCalled();
			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain("INFO");
			expect(output).toContain("Test message");

			consoleSpy.mockRestore();
		});
	});
});

describe("toBasicLogger", () => {
	it("adapts structured logger to basic interface", () => {
		const entries: LogEntry[] = [];
		const testOutput: LogOutput = {
			write(entry) {
				entries.push(entry);
			},
		};

		const structuredLogger = createStructuredLogger({ output: testOutput });
		const basicLogger = toBasicLogger(structuredLogger);

		basicLogger.info("Info message");
		basicLogger.warn("Warn message");
		basicLogger.error("Error message");

		expect(entries.length).toBe(3);
		expect(entries[0].level).toBe("info");
		expect(entries[1].level).toBe("warn");
		expect(entries[2].level).toBe("error");
	});

	it("handles error arguments in basic logger", () => {
		const entries: LogEntry[] = [];
		const testOutput: LogOutput = {
			write(entry) {
				entries.push(entry);
			},
		};

		const structuredLogger = createStructuredLogger({ output: testOutput });
		const basicLogger = toBasicLogger(structuredLogger);

		const error = new Error("Test error");
		basicLogger.error("Failed:", error);

		expect(entries[0].errorMessage).toBe("Test error");
	});
});
