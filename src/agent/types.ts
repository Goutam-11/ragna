export interface ContextItem {
  id: string;
  source: string;
  data: unknown;
}

export interface Evidence {
  id: string;
  source: string;
  data: unknown;
}

export interface RecordedToolError {
  tool: string;

  code: string;

  message: string;
}

export interface RecordedApproval {
  requestId: string;

  tool: string;

  status:
    | "denied"
    | "timed_out";

  message: string;
}

export interface RunState {
  objective: string;

  context: ContextItem[];

  evidence: Evidence[];

  toolErrors: RecordedToolError[];

  stepsUsed: number;

  approvals: RecordedApproval[];

  toolCallsUsed: number;
}

export type TerminationReason =
  | "COMPLETED"
  | "MAX_STEPS_REACHED"
  | "MAX_TOOL_CALLS_REACHED";