import type {
  ApprovalProvider,
} from "./provider";

import type {
  ApprovalDecision,
  ApprovalRequest,
} from "./types";

export class StaticApprovalProvider
  implements ApprovalProvider
{
  constructor(
    private readonly decision:
      ApprovalDecision,
  ) {}

  async requestApproval(
    _request: ApprovalRequest,
  ): Promise<ApprovalDecision> {
    return this.decision;
  }
}