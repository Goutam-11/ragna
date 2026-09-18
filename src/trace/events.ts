export type TraceEvent =
  | RunStartedEvent
  | ModelDecisionEvent
  | ApprovalRequiredEvent
  | ApprovalDecisionEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolErrorEvent
  | LimitReachedEvent
  | FinalResponseEvent;

export interface RunStartedEvent {
  type: "RUN_STARTED";
  objective: string;
}

export interface ModelDecisionEvent {
  type: "MODEL_DECISION";
  summary: string;
}

export interface ApprovalRequiredEvent {
  type: "APPROVAL_REQUIRED";

  requestId: string;

  tool: string;

  arguments: unknown;

  summary: string;

  timeoutMs: number;
}

export interface ApprovalDecisionEvent {
  type: "APPROVAL_DECISION";

  requestId: string;

  tool: string;

  decision:
    | "approved"
    | "denied"
    | "timed_out";

  reason?: string;
}

export interface ToolCallEvent {
  type: "TOOL_CALL";
  tool: string;
  arguments: unknown;
}

export interface ToolResultEvent {
  type: "TOOL_RESULT";

  tool: string;

  resultKind:
    | "context"
    | "evidence";

  resultId: string;

  result: unknown;
}

export interface ToolErrorEvent {
  type: "TOOL_ERROR";
  tool: string;
  code: string;
  message: string;
  details: unknown;
}

export interface LimitReachedEvent {
  type: "LIMIT_REACHED";
  reason:
    | "MAX_STEPS_REACHED"
    | "MAX_TOOL_CALLS_REACHED";
}

export interface FinalResponseEvent {
  type: "FINAL_RESPONSE";
  response: unknown;
}