import type { ModelDecision } from "./types";

export interface ModelContext {
  objective: string;

  context: {
    id: string;
    source: string;
    data: unknown;
  }[];
  
  evidence: {
    id: string;
    source: string;
    data: unknown;
  }[];

  approvals: {
    tool: string;

    status:
      | "denied"
      | "timed_out";

    message: string;
  }[];

  toolErrors: {
    tool: string;
    code: string;
    message: string;
  }[];
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ModelAdapter {
  decide(
    context: ModelContext,
    tools: ModelToolDefinition[],
  ): Promise<ModelDecision>;
}