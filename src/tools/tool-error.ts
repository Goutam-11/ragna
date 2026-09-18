import type { ToolResultKind } from "./tool";

export type ToolErrorCode =
  "UNKNOWN_TOOL" | "INVALID_INPUT" | "EXECUTION_FAILED" | "INVALID_OUTPUT";

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  toolName: string;
  details?: unknown;
}

export type ToolExecutionResult =
  | {
      success: true;
      kind: ToolResultKind;
      data: unknown;
    }
  | {
      success: false;
      error: ToolError;
    };
