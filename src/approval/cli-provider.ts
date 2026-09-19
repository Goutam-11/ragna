import type {
  ApprovalProvider,
} from "./provider";

import type {
  ApprovalDecision,
  ApprovalRequest,
} from "./types";

export class CliApprovalProvider
  implements ApprovalProvider
{
  async requestApproval(
    request: ApprovalRequest,
  ): Promise<ApprovalDecision> {
    console.log(
      "\n⚠ Approval required",
    );

    console.log(
      `Tool: ${request.tool}`,
    );

    console.log(
      "Arguments:",
    );

    console.log(
      JSON.stringify(
        request.arguments,
        null,
        2,
      ),
    );

    console.log(
      "\nModel-provided context:",
    );

    console.log(
      request.summary,
    );

    const answer = prompt(
      "\nApprove execution? [y/N]:",
    );

    const normalized =
      answer
        ?.trim()
        .toLowerCase();

    if (
      normalized === "y" ||
      normalized === "yes"
    ) {
      return {
        status: "approved",
      };
    }

    return {
      status: "denied",

      reason:
        "Operator rejected the operation.",
    };
  }
}