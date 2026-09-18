import { beforeEach, describe, expect, test } from "bun:test";

import { ToolRegistry } from "../src/tools/registry";
import { SearchLogsTool } from "../src/tools/search-logs";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(new SearchLogsTool());
  });

  test("executes a registered tool with valid input", async () => {
    const result = await registry.execute("search_logs", {
      service: "payment-api",
      level: "error",
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      throw new Error("Expected tool execution to succeed");
    }

    expect(result.data).toEqual({
      entries: [
        {
          timestamp: "2026-09-18T14:02:00Z",
          service: "payment-api",
          level: "error",
          message: "Database connection timeout",
        },
        {
          timestamp: "2026-09-18T14:04:00Z",
          service: "payment-api",
          level: "error",
          message: "Database connection timeout",
        },
      ],
    });
  });

  test("rejects an unknown tool", async () => {
    const result = await registry.execute(
      "delete_production_database",
      {},
    );

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected tool execution to fail");
    }

    expect(result.error.code).toBe("UNKNOWN_TOOL");
    expect(result.error.toolName).toBe(
      "delete_production_database",
    );
  });

  test("rejects invalid tool input", async () => {
    const result = await registry.execute("search_logs", {
      service: "payment-api",

      // Incorrect property.
      // SearchLogsTool expects `level`.
      loglevel: "error",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.toolName).toBe("search_logs");
  });

  test("returns a typed error when tool execution fails", async () => {
    const result = await registry.execute("search_logs", {
      service: "broken-service",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected tool execution to fail");
    }

    expect(result.error.code).toBe("EXECUTION_FAILED");
    expect(result.error.toolName).toBe("search_logs");

    expect(result.error.message).toBe(
      "Tool execution failed",
    );
  });
});