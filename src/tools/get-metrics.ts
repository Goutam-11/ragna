import { z } from "zod";

import type { ApprovalPolicy, Tool, ToolResultKind } from "./tool";
import { metrics } from "../fixtures/metrics";

export const GetMetricsInputSchema = z
  .object({
    service: z.string().min(1),

    metric: z.enum(["request_latency", "db_connection_usage"]).optional(),
  })
  .strict();

export type GetMetricsInput = z.infer<typeof GetMetricsInputSchema>;

export const GetMetricsOutputSchema = z.object({
  entries: z.array(
    z.object({
      timestamp: z.string(),
      service: z.string(),
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
    }),
  ),
});

export type GetMetricsOutput = z.infer<typeof GetMetricsOutputSchema>;

export class GetMetricsTool implements Tool<GetMetricsInput, GetMetricsOutput> {
  name = "get_metrics";

  description =
    "Get metrics for a service, optionally filtered by metric name.";

  resultKind: ToolResultKind = "evidence";

  inputSchema = GetMetricsInputSchema;
  outputSchema = GetMetricsOutputSchema;
  approvalPolicy: ApprovalPolicy = "never" as const;

  async execute(input: GetMetricsInput): Promise<GetMetricsOutput> {
    const entries = metrics.filter((entry) => {
      if (entry.service !== input.service) {
        return false;
      }

      if (input.metric && entry.metric !== input.metric) {
        return false;
      }

      return true;
    });

    return {
      entries,
    };
  }
}
