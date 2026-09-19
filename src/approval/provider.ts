import type { ApprovalDecision, ApprovalRequest } from "./types";

/**
 * Supplies human authorization for consequential tool execution.
 *
 * The provider decides approval; the runner remains responsible
 * for whether the tool is ultimately executed.
 */
export interface ApprovalProvider {
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}
