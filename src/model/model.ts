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

    status: "denied" | "timed_out";

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

/**
 * Provider-independent interface for agent decisions.
 *
 * Implementations may use a live LLM or deterministic scripted
 * decisions without changing the execution harness.
 */
export interface ModelAdapter {
  decide(
    context: ModelContext,
    tools: ModelToolDefinition[],
  ): Promise<ModelDecision>;
}
