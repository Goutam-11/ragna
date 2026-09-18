import { z } from "zod";

import type { ApprovalPolicy, Tool, ToolResultKind } from "./tool";
import { serviceStatuses } from "../fixtures/service-status";

export const GetServiceStatusInputSchema = z
  .object({
    service: z.string().min(1),
  })
  .strict();

export type GetServiceStatusInput = z.infer<typeof GetServiceStatusInputSchema>;

export const GetServiceStatusOutputSchema = z.object({
  service: z.string(),

  status: z.enum(["operational", "degraded", "outage"]),

  message: z.string(),
});

export type GetServiceStatusOutput = z.infer<
  typeof GetServiceStatusOutputSchema
>;

export class GetServiceStatusTool implements Tool<
  GetServiceStatusInput,
  GetServiceStatusOutput
> {
  name = "get_service_status";

  description = "Get the current operational status of a service.";

  resultKind: ToolResultKind = "evidence";

  inputSchema = GetServiceStatusInputSchema;

  outputSchema = GetServiceStatusOutputSchema;
  approvalPolicy: ApprovalPolicy = "never" as const;

  async execute(input: GetServiceStatusInput): Promise<GetServiceStatusOutput> {
    const status = serviceStatuses.find(
      (entry) => entry.service === input.service,
    );

    if (!status) {
      throw new Error(`Service status not found: ${input.service}`);
    }

    return status;
  }
}
