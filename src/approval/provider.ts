import type {
  ApprovalDecision,
  ApprovalRequest,
} from "./types";

export interface ApprovalProvider {
  requestApproval(
    request: ApprovalRequest,
  ): Promise<ApprovalDecision>;
}
