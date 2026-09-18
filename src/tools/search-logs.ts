import { z } from "zod";
import { logs } from "../fixtures/log";
import type { ApprovalPolicy, Tool, ToolResultKind } from "./tool";

export const SearchLogsInputSchema = z.object({
  service: z.string(),
  level: z.enum(["info", "warn", "error"]).optional(),
}).strict();

export type SearchLogsInput = z.infer<typeof SearchLogsInputSchema>;

export const SearchLogsOutputSchema = z.object({
  entries: z.array(
    z.object({
      timestamp: z.string(),
      service: z.string(),
      level: z.enum(["info", "warn", "error"]),
      message: z.string(),
    }),
  ),
});

export type SearchLogsOutput =
  z.infer<typeof SearchLogsOutputSchema>;

  export class SearchLogsTool
    implements Tool<SearchLogsInput, SearchLogsOutput>
  {
    name = "search_logs";
  
    description =
      "Search application logs by service and optional log level.";

    resultKind: ToolResultKind = "evidence";
    inputSchema = SearchLogsInputSchema;

    outputSchema = SearchLogsOutputSchema;
    approvalPolicy: ApprovalPolicy = "never" as const;
    async execute(
      input: SearchLogsInput,
    ): Promise<SearchLogsOutput> {
    
      if (input.service === "broken-service") {
         throw new Error(
           "Log storage is temporarily unavailable",
         );
      }
      
      const entries = logs.filter((entry) => {
        if (entry.service !== input.service) {
          return false;
        }
  
        if (input.level && entry.level !== input.level) {
          return false;
        }
  
        return true;
      });
  
      return {
        entries,
      };
    }
  }