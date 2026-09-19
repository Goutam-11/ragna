import type { ZodType } from "zod";

export type ToolResultKind = "context" | "evidence";

export type ApprovalPolicy = "never" | "required";

/**
 * Executable capability exposed to the agent.
 *
 * Inputs and outputs cross validation boundaries, while resultKind
 * determines whether a successful result becomes context or evidence.
 */
export interface Tool<TInput, TOutput> {
  name: string;
  description: string;

  resultKind: ToolResultKind;

  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  approvalPolicy: ApprovalPolicy;
  execute(input: TInput): Promise<TOutput>;
}

export type AnyTool = Tool<any, any>;
