/**
 * Registry and validation boundary for agent tools.
 *
 * Model-provided tool names and arguments are treated as untrusted
 * until they have been resolved and validated here.
 */
import type { AnyTool, Tool } from "./tool";
import type { ToolError, ToolExecutionResult } from "./tool-error";

import type { ModelToolDefinition } from "../model/model";
import z from "zod";

export interface PreparedToolCall {
  tool: AnyTool;
  toolName: string;
  arguments: unknown;

  resultKind: "context" | "evidence";

  approval: "never" | "required";
}

export type PrepareToolResult =
  | {
      success: true;
      call: PreparedToolCall;
    }
  | {
      success: false;
      error: ToolError;
    };

export class ToolRegistry {
  private tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  list(): AnyTool[] {
    return Array.from(this.tools.values());
  }

  getModelDefinitions(): ModelToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema),
    }));
  }
  
  /**
   * Resolves a model-requested tool and validates its arguments.
   *
   * No tool code is executed here. This separation allows the runner
   * to enforce budgets and approval after validation but before execution.
   */
  prepare(toolName: string, args: unknown): PrepareToolResult {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,

        error: {
          code: "UNKNOWN_TOOL",
          toolName,
          message: `Unknown tool: ${toolName}`,
        },
      };
    }

    const inputResult = tool.inputSchema.safeParse(args);

    if (!inputResult.success) {
      return {
        success: false,

        error: {
          code: "INVALID_INPUT",
          toolName,
          message: "Tool input failed validation",

          details: inputResult.error.issues,
        },
      };
    }

    return {
      success: true,

      call: {
        tool,
        toolName,

        // Important: use Zod's validated value.
        arguments: inputResult.data,

        resultKind: tool.resultKind,

        approval: tool.approvalPolicy,
      },
    };
  }

  /**
   * Executes an already validated tool call and validates its output
   * before returning it to the agent loop.
   */
  async executePrepared(call: PreparedToolCall): Promise<ToolExecutionResult> {
    let rawOutput: unknown;

    try {
      rawOutput = await call.tool.execute(call.arguments);
    } catch (error) {
      return {
        success: false,

        error: {
          code: "EXECUTION_FAILED",

          toolName: call.toolName,

          message: "Tool execution failed",

          details: {
            errorType: error instanceof Error ? error.name : "UnknownError",

            errorMessage:
              error instanceof Error
                ? error.message
                : "Unknown tool execution error",
          },
        },
      };
    }

    const outputResult = call.tool.outputSchema.safeParse(rawOutput);

    if (!outputResult.success) {
      return {
        success: false,

        error: {
          code: "INVALID_OUTPUT",

          toolName: call.toolName,

          message: "Tool returned malformed output",

          details: outputResult.error.issues,
        },
      };
    }

    return {
      success: true,
      kind: call.resultKind,
      data: outputResult.data,
    };
  }

  async execute(toolName: string, args: unknown): Promise<ToolExecutionResult> {
    const tool = this.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: {
          code: "UNKNOWN_TOOL",
          toolName,
          message: `Unknown tool: ${toolName}`,
        },
      };
    }

    // 1. Validate input schema
    const inputResult = tool.inputSchema.safeParse(args);

    if (!inputResult.success) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          toolName,
          message: "Tool input failed validation",
          details: inputResult.error.issues,
        },
      };
    }

    // 2. Execute tool
    let rawOutput: unknown;

    try {
      rawOutput = await tool.execute(inputResult.data);
    } catch (error) {
      return {
        success: false,
        error: {
          code: "EXECUTION_FAILED",
          toolName,
          message: "Tool execution failed",
          details: getErrorDetails(error),
        },
      };
    }

    // 3. Validate output schema
    const outputResult = tool.outputSchema.safeParse(rawOutput);

    if (!outputResult.success) {
      return {
        success: false,
        error: {
          code: "INVALID_OUTPUT",
          toolName,
          message: "Tool output failed validation",
          details: outputResult.error.issues,
        },
      };
    }

    return {
      success: true,
      kind: tool.resultKind,
      data: outputResult.data,
    };
  }
}

function getErrorDetails(error: unknown): unknown {
  return {
    errorType: error instanceof Error ? error.name : "UnknownError",
    errorMessage:
      error instanceof Error ? error.message : "Unknown tool execution error",
  };
}
