export interface ExecutionLimits {
  maxSteps: number;
  maxToolCalls: number;
}

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxSteps: 10,
  maxToolCalls: 5,
};

export function validateExecutionLimits(
  limits: ExecutionLimits,
): void {
  if (
    !Number.isInteger(limits.maxSteps) ||
    limits.maxSteps <= 0
  ) {
    throw new Error(
      "maxSteps must be a positive integer",
    );
  }

  if (
    !Number.isInteger(limits.maxToolCalls) ||
    limits.maxToolCalls <= 0
  ) {
    throw new Error(
      "maxToolCalls must be a positive integer",
    );
  }
}