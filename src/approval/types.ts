export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "denied"
  | "timed_out";

export interface ApprovalRequest {
  requestId: string;

  tool: string;

  arguments: unknown;

  summary: string;

  timeoutMs: number;
}

export type ApprovalDecision =
  | {
      status: "approved";
    }
  | {
      status: "denied";
      reason?: string;
    }
  | {
      status: "timed_out";
    };