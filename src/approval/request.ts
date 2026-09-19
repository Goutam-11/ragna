import type {
  ApprovalProvider,
} from "./provider";

import type {
  ApprovalDecision,
  ApprovalRequest,
} from "./types";

/**
 * Requests approval with a bounded wait.
 *
 * A timeout is represented as an approval outcome rather than leaving
 * the investigation waiting indefinitely.
 */
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