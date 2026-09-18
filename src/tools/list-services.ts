import { z } from "zod";

import type { ApprovalPolicy, Tool, ToolResultKind } from "./tool";

const ListServicesInputSchema = z.object({}).strict();

const ListServicesOutputSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),

      description: z.string(),

      type: z.enum(["application", "infrastructure"]),

      dependencies: z.array(z.string()),
    }),
  ),
});

type ListServicesInput = z.infer<typeof ListServicesInputSchema>;

type ListServicesOutput = z.infer<typeof ListServicesOutputSchema>;

export class ListServicesTool implements Tool<
  ListServicesInput,
  ListServicesOutput
> {
  name = "list_services";

  description =
    "List services available in the system. Use this when the relevant service name is unknown.";

  resultKind: ToolResultKind = "context";

  inputSchema = ListServicesInputSchema;

  outputSchema = ListServicesOutputSchema;
  approvalPolicy: ApprovalPolicy = "never" as const;

  async execute(): Promise<ListServicesOutput> {
    return {
      services: [
        {
          name: "checkout-api",
          description: "Handles checkout requests.",
          type: "application",
          dependencies: ["payment-api"],
        },

        {
          name: "payment-api",
          description: "Processes payments.",
          type: "application",
          dependencies: ["database"],
        },

        {
          name: "database",
          description: "Stores payment and transaction data.",
          type: "infrastructure",
          dependencies: [],
        },
      ],
    };
  }
}
