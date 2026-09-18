export interface ToolCallDecision {
  type: "tool_call";

  tool: string;

  arguments: unknown;

  summary: string;
}

export interface FinalDecision {
  type: "final";

  response: {
    evidence: {
      evidenceId: string;
      statement: string;
    }[];

    conclusion: string;

    recommendations: string[];
  };
}

export type ModelDecision =
  | ToolCallDecision
  | FinalDecision;