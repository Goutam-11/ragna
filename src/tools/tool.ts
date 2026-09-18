import type { ZodType } from "zod";

export type ToolResultKind = "context" | "evidence";

export type ApprovalPolicy = "never" | "required";

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
