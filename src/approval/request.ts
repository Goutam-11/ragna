import type {
  ApprovalProvider,
} from "./provider";

import type {
  ApprovalDecision,
  ApprovalRequest,
} from "./types";

export async function requestApprovalWithTimeout(
  provider: ApprovalProvider,
  request: ApprovalRequest,
): Promise<ApprovalDecision> {
  let timer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    return await Promise.race([
      provider.requestApproval(
        request,
      ),

      new Promise<ApprovalDecision>(
        (resolve) => {
          timer = setTimeout(
            () => {
              resolve({
                status:
                  "timed_out",
              });
            },

            request.timeoutMs,
          );
        },
      ),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}